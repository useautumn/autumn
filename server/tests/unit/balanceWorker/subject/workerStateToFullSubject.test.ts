import { describe, expect, test } from "bun:test";
import {
	type CatalogRow,
	catalogRowsToCatalog,
	mergeSubjectStates,
} from "@autumn/balance-engine";
import {
	AppEnv,
	CusProductStatus,
	FeatureType,
	FreeTrialDuration,
	type FullCustomerEntitlement,
	getApiCustomerLicenses,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import { autumnBillingPlanToCatalogRows } from "@/internal/balanceWorker/billingPlan/autumnBillingPlanToCatalogRows.js";
import { workerStateToFullSubject } from "@/internal/balanceWorker/subject/workerStateToFullSubject.js";
import {
	firstGrantOf,
	product,
	rollover,
	workerEntity,
} from "../billingPlan/billingPlanFixtures.js";
import {
	customerMemory,
	entityMemory,
} from "../billingPlan/workerMemory/workerMemory.js";

const parent = product({ id: "cp_team" });

const pool = ({
	id,
	planLicenseId,
	parentId = parent.id,
}: {
	id: string;
	planLicenseId: string | null;
	parentId?: string;
}) => ({
	id,
	link_id: `link_${id}`,
	internal_customer_id: parent.internal_customer_id,
	parent_customer_product_id: parentId,
	license_internal_product_id: "internal_seat",
	plan_license_id: planLicenseId,
	granted: 10,
	remaining: 7,
	paid_quantity: 5,
	created_at: 1,
	updated_at: 1,
});

const seatProduct = products.createFull({ id: "seat" });
const [seatPrice] = parent.customer_prices;
const seatEntitlement = firstGrantOf(parent).entitlement;

/** The seat link as the worker's catalog holds it: made of the parent's own price and entitlement. */
const seatPlanLicenseRows = (): CatalogRow[] => [
	{
		table: "planLicenses",
		row: {
			id: "pl_seat",
			parent_internal_product_id: parent.internal_product_id,
			license_internal_product_id: seatProduct.internal_id,
			org_id: seatProduct.org_id,
			env: seatProduct.env,
			is_custom: false,
			included: 5,
			prepaid_only: true,
			customized: false,
			metadata: {},
			created_at: 1,
			updated_at: 1,
			price_ids: seatPrice ? [seatPrice.price.id] : [],
			entitlement_ids: [seatEntitlement.id],
			internal_feature_ids: [seatEntitlement.internal_feature_id],
		},
	},
	{ table: "products", row: seatProduct },
];

const fullSubjectWithPools = () => {
	const state = {
		...customerMemory({ customerProducts: [parent] }),
		customerLicenses: [
			pool({ id: "cl_live", planLicenseId: "pl_seat" }),
			pool({ id: "cl_removed_link", planLicenseId: null }),
			pool({ id: "cl_uncached_link", planLicenseId: "pl_deleted" }),
		],
	};
	const catalog = catalogRowsToCatalog({
		rows: [
			...autumnBillingPlanToCatalogRows({
				autumnBillingPlan: {
					customerId: "cus_test",
					insertCustomerProducts: [parent],
				},
			}),
			...seatPlanLicenseRows(),
		],
	});
	return workerStateToFullSubject({
		state,
		catalog,
		subscriptions: [],
		invoices: [],
	});
};

describe("workerStateToFullSubject: license pools", () => {
	test("each product carries the worker's pools with their definitions; a removed or uncached link keeps none", () => {
		const [customerProduct] = fullSubjectWithPools().customer_products;
		expect(
			customerProduct?.customer_licenses?.map(({ id, planLicense }) => [
				id,
				planLicense?.id ?? null,
			]),
		).toEqual([
			["cl_live", "pl_seat"],
			["cl_removed_link", null],
			["cl_uncached_link", null],
		]);
	});

	test("a definition is assembled from the catalog: the license product with its effective items", () => {
		const [customerProduct] = fullSubjectWithPools().customer_products;
		const planLicense = customerProduct?.customer_licenses?.[0]?.planLicense;
		expect({
			product: planLicense?.product.internal_id,
			prices: planLicense?.product.prices.map(({ id }) => id),
			entitlements: planLicense?.product.entitlements.map(({ id, feature }) => [
				id,
				feature.internal_id,
			]),
		}).toEqual({
			product: seatProduct.internal_id,
			prices: [seatPrice?.price.id],
			entitlements: [[seatEntitlement.id, seatEntitlement.internal_feature_id]],
		});
	});

	test("customers.get renders the live pool's seats from the worker's counters", () => {
		const { customer_products } = fullSubjectWithPools();
		expect(
			getApiCustomerLicenses({ customerProducts: customer_products }),
		).toEqual([
			{
				license_plan_id: "seat",
				parent_plan_id: parent.product.id,
				license_plan_name: expect.any(String),
				granted: 10,
				usage: 3,
				remaining: 7,
				paid_quantity: 5,
			},
		]);
	});
});

describe("workerStateToFullSubject: pooled sources", () => {
	test("a pool's source row stays in the worker's state but never renders, on its product or loose", () => {
		const base = customerMemory({ customerProducts: [parent] });
		const [grant] = base.customerEntitlements;
		if (!grant) throw new Error("fixture has no grant");
		const state = {
			...base,
			customerEntitlements: [
				...base.customerEntitlements,
				{ ...grant, id: "ce_source", pooled_contribution_id: "share_1" },
				{
					...grant,
					id: "ce_loose_source",
					customer_product_id: null,
					pooled_contribution_id: "share_2",
				},
			],
		};
		const catalog = catalogRowsToCatalog({
			rows: autumnBillingPlanToCatalogRows({
				autumnBillingPlan: {
					customerId: "cus_test",
					insertCustomerProducts: [parent],
				},
			}),
		});
		const fullSubject = workerStateToFullSubject({
			state,
			catalog,
			subscriptions: [],
			invoices: [],
		});
		expect(
			fullSubject.customer_products[0]?.customer_entitlements.map(
				({ id }) => id,
			),
		).toEqual([grant.id]);
		expect(fullSubject.extra_customer_entitlements).toEqual([]);
	});
});

describe("workerStateToFullSubject: loose grants", () => {
	test("a loose grant drained to 0 after hydration is left out; one with a pending reset stays", () => {
		const base = customerMemory({ customerProducts: [parent] });
		const [grant] = base.customerEntitlements;
		if (!grant) throw new Error("fixture has no grant");
		const loose = { ...grant, customer_product_id: null, next_reset_at: null };
		const state = {
			...base,
			customerEntitlements: [
				...base.customerEntitlements,
				{ ...loose, id: "ce_drained", balance: 0 },
				{ ...loose, id: "ce_live", balance: 3 },
				{ ...loose, id: "ce_resetting", balance: 0, next_reset_at: 1 },
			],
		};
		const catalog = catalogRowsToCatalog({
			rows: autumnBillingPlanToCatalogRows({
				autumnBillingPlan: {
					customerId: "cus_test",
					insertCustomerProducts: [parent],
				},
			}),
		});
		const fullSubject = workerStateToFullSubject({
			state,
			catalog,
			subscriptions: [],
			invoices: [],
		});
		expect(fullSubject.extra_customer_entitlements.map(({ id }) => id)).toEqual(
			["ce_live", "ce_resetting"],
		);
	});
});

describe("workerStateToFullSubject: rollovers", () => {
	test("a rollover that expired after hydration is left out by the read's clock; a live one stays", () => {
		const base = customerMemory({ customerProducts: [parent] });
		const [grant] = base.customerEntitlements;
		if (!grant) throw new Error("fixture has no grant");
		const now = 1_000;
		const state = {
			...base,
			rollovers: [
				rollover({
					id: "ro_expired",
					grantId: grant.id,
					balance: 5,
					expiresAt: now,
				}),
				rollover({
					id: "ro_live",
					grantId: grant.id,
					balance: 5,
					expiresAt: now + 1,
				}),
			],
		};
		const catalog = catalogRowsToCatalog({
			rows: autumnBillingPlanToCatalogRows({
				autumnBillingPlan: {
					customerId: "cus_test",
					insertCustomerProducts: [parent],
				},
			}),
		});
		const fullSubject = workerStateToFullSubject({
			state,
			catalog,
			subscriptions: [],
			invoices: [],
			now,
		});
		expect(
			fullSubject.customer_products[0]?.customer_entitlements[0]?.rollovers.map(
				({ id }) => id,
			),
		).toEqual(["ro_live"]);
	});
});

describe("workerStateToFullSubject: product order", () => {
	test("legacy's order: the entity's own plan, then priced before free, main before add-on, newest first", () => {
		const older = { ...product({ id: "cp_older" }), created_at: 1 };
		const newer = { ...product({ id: "cp_newer" }), created_at: 2 };
		const addOnBase = product({ id: "cp_addon" });
		const addOn = {
			...addOnBase,
			created_at: 3,
			product: { ...addOnBase.product, is_add_on: true },
		};
		const free = {
			...product({ id: "cp_free" }),
			created_at: 4,
			customer_prices: [],
		};
		const own = { ...product({ id: "cp_own", onEntity: true }), created_at: 0 };
		const customerProducts = [free, older, addOn, newer];
		const state = mergeSubjectStates({
			customer: customerMemory({ customerProducts }),
			entity: entityMemory({ entity: workerEntity, customerProducts: [own] })
				.state,
		});
		const catalog = catalogRowsToCatalog({
			rows: autumnBillingPlanToCatalogRows({
				autumnBillingPlan: {
					customerId: "cus_test",
					insertCustomerProducts: [...customerProducts, own],
				},
			}),
		});
		const fullSubject = workerStateToFullSubject({
			state,
			catalog,
			subscriptions: [],
			invoices: [],
		});
		expect(fullSubject.customer_products.map(({ id }) => id)).toEqual([
			"cp_own",
			"cp_newer",
			"cp_older",
			"cp_addon",
			"cp_free",
		]);
	});
});

describe("workerStateToFullSubject: flags", () => {
	const booleanGrant = ({
		id,
		customerProductId,
	}: {
		id: string;
		customerProductId: string | null;
	}): FullCustomerEntitlement => ({
		...customerEntitlements.create({
			id,
			featureId: "sso",
			featureName: "SSO",
			featureType: FeatureType.Boolean,
			allowance: 0,
			balance: 0,
		}),
		customer_product_id: customerProductId,
		internal_entity_id: null,
	});

	test("one row per boolean feature: an active plan's beats a loose grant's, which beats a scheduled plan's", () => {
		const active = product({
			id: "cp_active",
			grants: [
				booleanGrant({ id: "flag_active", customerProductId: "cp_active" }),
			],
		});
		const scheduled = product({
			id: "cp_scheduled",
			status: CusProductStatus.Scheduled,
			grants: [
				booleanGrant({
					id: "flag_scheduled",
					customerProductId: "cp_scheduled",
				}),
			],
		});
		const loose = booleanGrant({ id: "flag_loose", customerProductId: null });
		const memory = customerMemory({
			customerProducts: [scheduled, active],
			looseGrants: [loose],
		});
		const catalog = catalogRowsToCatalog({
			rows: [
				...autumnBillingPlanToCatalogRows({
					autumnBillingPlan: {
						customerId: "cus_test",
						insertCustomerProducts: [scheduled, active],
					},
				}),
				{ table: "entitlements", row: loose.entitlement },
				{ table: "features", row: loose.entitlement.feature },
			],
		});
		const render = (state: typeof memory) => {
			const fullSubject = workerStateToFullSubject({
				state,
				catalog,
				subscriptions: [],
				invoices: [],
			});
			return {
				onPlans: fullSubject.customer_products.flatMap(
					({ customer_entitlements }) =>
						customer_entitlements.map(({ id }) => id),
				),
				loose: fullSubject.extra_customer_entitlements.map(({ id }) => id),
			};
		};
		expect(render(memory)).toEqual({ onPlans: ["flag_active"], loose: [] });

		const withoutActive = {
			...memory,
			customerProducts: memory.customerProducts.filter(
				({ id }) => id !== "cp_active",
			),
			customerEntitlements: memory.customerEntitlements.filter(
				({ id }) => id !== "flag_active",
			),
		};
		expect(render(withoutActive)).toEqual({
			onPlans: [],
			loose: ["flag_loose"],
		});
	});
});

describe("workerStateToFullSubject: free trials", () => {
	test("a product renders its free trial from the catalog; one the catalog lacks renders none", () => {
		const trialing = { ...product({ id: "cp_trial" }), free_trial_id: "ft_1" };
		const gone = { ...product({ id: "cp_gone" }), free_trial_id: "ft_gone" };
		const state = customerMemory({ customerProducts: [trialing, gone] });
		const freeTrial = {
			id: "ft_1",
			created_at: 1,
			internal_product_id: trialing.internal_product_id,
			duration: FreeTrialDuration.Day,
			length: 7,
			unique_fingerprint: false,
			is_custom: false,
			card_required: true,
			on_end: "revert" as const,
		};
		const catalog = catalogRowsToCatalog({
			rows: [
				...autumnBillingPlanToCatalogRows({
					autumnBillingPlan: {
						customerId: "cus_test",
						insertCustomerProducts: [trialing, gone],
					},
				}),
				{
					table: "freeTrials",
					row: { ...freeTrial, org_id: "org_test", env: AppEnv.Sandbox },
				},
			],
		});
		const fullSubject = workerStateToFullSubject({
			state,
			catalog,
			subscriptions: [],
			invoices: [],
		});
		expect(
			fullSubject.customer_products.map(({ id, free_trial }) => [
				id,
				free_trial,
			]),
		).toEqual([
			["cp_trial", freeTrial],
			["cp_gone", null],
		]);
	});
});

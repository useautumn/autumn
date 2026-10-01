import { describe, expect, test } from "bun:test";
import type { FullCusProduct } from "@autumn/shared";
import {
	AppEnv,
	CusProductStatus,
	type FullCustomer,
	type FullCustomerSchedule,
	ProductItemInterval,
	type ProductV2,
} from "@autumn/shared";
import { customerProductToCustomerStatePlan } from "@/components/forms/customer-state/customerProductToCustomerStatePlan";
import { EMPTY_CUSTOMER_STATE_PLAN } from "@/components/forms/customer-state/customerStateSchema";
import {
	buildInitialValues,
	getActiveCustomerPlans,
} from "@/views/customers2/components/sheets/CreateScheduleSheet";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProduct({
	id = "prod_1",
	name = "Pro Plan",
	items = [],
}: {
	id?: string;
	name?: string;
	items?: ProductV2["items"];
} = {}): ProductV2 {
	return {
		id,
		name,
		is_add_on: false,
		is_default: false,
		version: 1,
		group: null,
		env: AppEnv.Sandbox,
		items,
		created_at: Date.now(),
	};
}

function makeFixedPrice({
	id = "price_base",
	internalProductId = "int_prod_1",
	amount = 2000,
	interval = "month",
}: {
	id?: string;
	internalProductId?: string;
	amount?: number;
	interval?: string;
} = {}) {
	return {
		id,
		internal_product_id: internalProductId,
		config: {
			type: "fixed",
			amount,
			interval,
			interval_count: 1,
		},
		entitlement_id: null,
		proration_config: null,
	};
}

function makeUsagePrice({
	id = "price_usage",
	internalProductId = "int_prod_1",
	entitlementId = "ent_1",
	featureId = "api_calls",
	interval = "month",
	tiers = [{ to: -1, amount: 0.01 }],
}: {
	id?: string;
	internalProductId?: string;
	entitlementId?: string;
	featureId?: string;
	interval?: string;
	tiers?: Array<{ to: number; amount: number }>;
} = {}) {
	return {
		id,
		internal_product_id: internalProductId,
		config: {
			type: "usage",
			bill_when: "end_of_period",
			billing_units: 1,
			internal_feature_id: `int_${featureId}`,
			feature_id: featureId,
			usage_tiers: tiers,
			interval,
			interval_count: 1,
		},
		entitlement_id: entitlementId,
		proration_config: null,
	};
}

function makeEntitlementWithFeature({
	id = "ent_1",
	internalProductId = "int_prod_1",
	featureId = "api_calls",
	featureName = "API Calls",
	allowance = 1000,
	interval = "month",
}: {
	id?: string;
	internalProductId?: string;
	featureId?: string;
	featureName?: string;
	allowance?: number;
	interval?: string;
} = {}) {
	return {
		id,
		created_at: Date.now(),
		internal_feature_id: `int_${featureId}`,
		internal_product_id: internalProductId,
		is_custom: false,
		allowance_type: "fixed" as const,
		allowance,
		interval,
		interval_count: 1,
		carry_from_previous: false,
		entity_feature_id: null,
		feature_id: featureId,
		usage_limit: null,
		rollover: null,
		feature: {
			id: featureId,
			name: featureName,
			type: "usage",
			internal_id: `int_${featureId}`,
			created_at: Date.now(),
			org_id: "org_1",
		},
	};
}

function makeCusProduct({
	id = "cp_1",
	productId = "prod_1",
	isCustom = false,
	status = CusProductStatus.Active,
	customerPrices = [] as any[],
	customerEntitlements = [] as any[],
	options = [] as any[],
}: {
	id?: string;
	productId?: string;
	isCustom?: boolean;
	status?: CusProductStatus;
	customerPrices?: any[];
	customerEntitlements?: any[];
	options?: any[];
} = {}): FullCusProduct {
	return {
		id,
		internal_product_id: `int_${productId}`,
		product_id: productId,
		internal_customer_id: "int_cus_1",
		customer_id: "cus_1",
		status,
		is_custom: isCustom,
		options,
		customer_prices: customerPrices,
		customer_entitlements: customerEntitlements,
		product: {
			id: productId,
			name: "Plan",
			internal_id: `int_${productId}`,
		} as any,
		billing_version: "v2",
		external_id: null,
	} as FullCusProduct;
}

function makeCustomer({
	customerProducts = [],
	schedule,
}: {
	customerProducts?: FullCusProduct[];
	schedule?: FullCustomerSchedule;
} = {}): FullCustomer {
	return {
		internal_id: "int_cus_1",
		id: "cus_1",
		name: "Test Customer",
		email: "test@example.com",
		org_id: "org_1",
		env: AppEnv.Sandbox,
		created_at: Date.now(),
		customer_products: customerProducts,
		entities: [],
		extra_customer_entitlements: [],
		schedule,
	} as unknown as FullCustomer;
}

// ---------------------------------------------------------------------------
// customerProductToCustomerStatePlan
// ---------------------------------------------------------------------------

describe("customerProductToCustomerStatePlan", () => {
	test("returns items: null for non-custom product", () => {
		const cusProduct = makeCusProduct({ productId: "prod_1", isCustom: false });
		const products = [makeProduct({ id: "prod_1" })];

		const plan = customerProductToCustomerStatePlan({ cusProduct, products });

		expect(plan.productId).toBe("prod_1");
		expect(plan.items).toBeNull();
	});

	test("reconstructs base price item from custom customer product", () => {
		const basePrice = makeFixedPrice({ amount: 5000, interval: "month" });
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: true,
			customerPrices: [{ id: "cp_price_1", price: basePrice } as any],
			customerEntitlements: [],
		});
		const products = [makeProduct({ id: "prod_1" })];

		const plan = customerProductToCustomerStatePlan({ cusProduct, products });

		expect(plan.items).not.toBeNull();
		expect(plan.items!.length).toBe(1);

		const priceItem = plan.items!.find(
			(item) => item.price != null && !item.feature_id,
		);
		expect(priceItem).toBeDefined();
		expect(priceItem!.price).toBe(5000);
		expect(priceItem!.interval).toBe(ProductItemInterval.Month);
	});

	test("reconstructs feature items from custom customer product", () => {
		const usagePrice = makeUsagePrice({
			entitlementId: "ent_1",
			featureId: "api_calls",
			tiers: [{ to: -1, amount: 0.02 }],
		});
		const entitlement = makeEntitlementWithFeature({
			id: "ent_1",
			featureId: "api_calls",
			allowance: 2000,
		});
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: true,
			customerPrices: [{ id: "cp_price_1", price: usagePrice } as any],
			customerEntitlements: [
				{ id: "ce_1", entitlement, replaceables: [], rollovers: [] } as any,
			],
		});
		const products = [makeProduct({ id: "prod_1" })];

		const plan = customerProductToCustomerStatePlan({ cusProduct, products });

		expect(plan.items).not.toBeNull();
		expect(plan.items!.length).toBeGreaterThanOrEqual(1);

		const featureItem = plan.items!.find(
			(item) => item.feature_id === "api_calls",
		);
		expect(featureItem).toBeDefined();
		expect(featureItem!.tiers).toBeDefined();
		expect(featureItem!.tiers!.length).toBe(1);
		expect(featureItem!.tiers![0].amount).toBe(0.02);
	});

	test("reconstructs both base price and feature items for fully custom product", () => {
		const basePrice = makeFixedPrice({ amount: 9900 });
		const usagePrice = makeUsagePrice({
			entitlementId: "ent_1",
			featureId: "seats",
			tiers: [{ to: -1, amount: 10 }],
		});
		const entitlement = makeEntitlementWithFeature({
			id: "ent_1",
			featureId: "seats",
			featureName: "Seats",
			allowance: 5,
		});
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: true,
			customerPrices: [
				{ id: "cp_p1", price: basePrice } as any,
				{ id: "cp_p2", price: usagePrice } as any,
			],
			customerEntitlements: [
				{ id: "ce_1", entitlement, replaceables: [], rollovers: [] } as any,
			],
		});
		const products = [makeProduct({ id: "prod_1" })];

		const plan = customerProductToCustomerStatePlan({ cusProduct, products });

		expect(plan.items).not.toBeNull();
		const priceItem = plan.items!.find(
			(item) => item.price != null && !item.feature_id,
		);
		const featureItem = plan.items!.find((item) => item.feature_id === "seats");
		expect(priceItem).toBeDefined();
		expect(priceItem!.price).toBe(9900);
		expect(featureItem).toBeDefined();
	});

	test("returns null items when no prices/entitlements even if is_custom", () => {
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: true,
			customerPrices: [],
			customerEntitlements: [],
		});
		const products = [makeProduct({ id: "prod_1" })];

		const plan = customerProductToCustomerStatePlan({ cusProduct, products });

		expect(plan.items).toBeNull();
		expect(plan.isCustom).toBe(true);
	});

	test("detects isCustom from price-level is_custom when cusProduct.is_custom is false", () => {
		const basePrice = makeFixedPrice({ amount: 3000, interval: "month" });
		(basePrice as any).is_custom = true;
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: false,
			customerPrices: [{ id: "cp_price_1", price: basePrice } as any],
			customerEntitlements: [],
		});
		const products = [makeProduct({ id: "prod_1" })];

		const plan = customerProductToCustomerStatePlan({ cusProduct, products });

		expect(plan.isCustom).toBe(true);
		expect(plan.items).not.toBeNull();
		expect(
			plan.items!.find((item) => item.price != null && !item.feature_id)!.price,
		).toBe(3000);
	});

	test("detects isCustom from entitlement-level is_custom when cusProduct.is_custom is false", () => {
		const entitlement = makeEntitlementWithFeature({
			id: "ent_1",
			featureId: "api_calls",
			allowance: 500,
		});
		(entitlement as any).is_custom = true;
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: false,
			customerPrices: [],
			customerEntitlements: [
				{ id: "ce_1", entitlement, replaceables: [], rollovers: [] } as any,
			],
		});
		const products = [makeProduct({ id: "prod_1" })];

		const plan = customerProductToCustomerStatePlan({ cusProduct, products });

		expect(plan.isCustom).toBe(true);
	});

	test("isCustom is false when no custom flags at any level", () => {
		const basePrice = makeFixedPrice({ amount: 2000, interval: "month" });
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: false,
			customerPrices: [{ id: "cp_price_1", price: basePrice } as any],
			customerEntitlements: [],
		});
		const products = [makeProduct({ id: "prod_1" })];

		const plan = customerProductToCustomerStatePlan({ cusProduct, products });

		expect(plan.isCustom).toBe(false);
	});

	test("custom plan with boolean + base price + prepaid includes all items", () => {
		const basePrice = makeFixedPrice({ amount: 1500, interval: "month" });
		const usagePrice = makeUsagePrice({
			id: "price_users",
			entitlementId: "ent_users",
			featureId: "users",
			tiers: [{ to: -1, amount: 10 }],
		});
		const usersEntitlement = makeEntitlementWithFeature({
			id: "ent_users",
			featureId: "users",
			featureName: "Users",
			allowance: 0,
		});
		const booleanEntitlement = {
			id: "ent_admin",
			created_at: Date.now(),
			internal_feature_id: "int_admin_rights",
			internal_product_id: "int_prod_1",
			is_custom: true,
			allowance_type: null,
			allowance: null,
			interval: null,
			interval_count: 1,
			carry_from_previous: false,
			entity_feature_id: null,
			feature_id: "admin_rights",
			usage_limit: null,
			rollover: null,
			feature: {
				id: "admin_rights",
				name: "Admin Rights",
				type: "boolean",
				internal_id: "int_admin_rights",
				created_at: Date.now(),
				org_id: "org_1",
			},
		};
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: true,
			customerPrices: [
				{ id: "cp_p1", price: basePrice } as any,
				{ id: "cp_p2", price: usagePrice } as any,
			],
			customerEntitlements: [
				{
					id: "ce_users",
					entitlement: usersEntitlement,
					replaceables: [],
					rollovers: [],
				} as any,
				{
					id: "ce_admin",
					entitlement: booleanEntitlement,
					replaceables: [],
					rollovers: [],
				} as any,
			],
		});
		const products = [
			makeProduct({
				id: "prod_1",
				items: [{ feature_id: "users", usage_model: "prepaid" } as any],
			}),
		];

		const plan = customerProductToCustomerStatePlan({ cusProduct, products });

		expect(plan.isCustom).toBe(true);
		expect(plan.items).not.toBeNull();

		const basePriceItem = plan.items!.find(
			(item) => item.price != null && !item.feature_id,
		);
		expect(basePriceItem).toBeDefined();
		expect(basePriceItem!.price).toBe(1500);

		const usersItem = plan.items!.find((item) => item.feature_id === "users");
		expect(usersItem).toBeDefined();

		const adminItem = plan.items!.find(
			(item) => item.feature_id === "admin_rights",
		);
		expect(adminItem).toBeDefined();
		expect(adminItem!.feature_id).toBe("admin_rights");
	});

	test("custom plan includes product catalog items missing from customer data", () => {
		const basePrice = makeFixedPrice({ amount: 2000, interval: "month" });
		(basePrice as any).is_custom = true;
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: false,
			customerPrices: [{ id: "cp_p1", price: basePrice } as any],
			customerEntitlements: [],
		});
		const products = [
			makeProduct({
				id: "prod_1",
				items: [
					{
						feature_id: "dashboard",
						type: "feature",
					} as any,
				],
			}),
		];

		const plan = customerProductToCustomerStatePlan({ cusProduct, products });

		expect(plan.isCustom).toBe(true);
		expect(plan.items).not.toBeNull();

		const dashboardItem = plan.items!.find(
			(item) => item.feature_id === "dashboard",
		);
		expect(dashboardItem).toBeDefined();

		const priceItem = plan.items!.find(
			(item) => item.price != null && !item.feature_id,
		);
		expect(priceItem).toBeDefined();
		expect(priceItem!.price).toBe(2000);
	});

	test("computes prepaid options from backend options", () => {
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			options: [{ feature_id: "credits", quantity: 500 }],
		});
		const products = [
			makeProduct({
				id: "prod_1",
				items: [{ feature_id: "credits", usage_model: "prepaid" } as any],
			}),
		];

		const plan = customerProductToCustomerStatePlan({ cusProduct, products });

		expect(plan.prepaidOptions).toBeDefined();
		expect(plan.prepaidOptions.credits).toBe(500);
	});

	test("returns empty prepaidOptions when product has no prepaid items", () => {
		const cusProduct = makeCusProduct({ productId: "prod_1" });
		const products = [makeProduct({ id: "prod_1", items: [] })];

		const plan = customerProductToCustomerStatePlan({ cusProduct, products });

		expect(plan.prepaidOptions).toEqual({});
	});

	test("handles missing product in products list gracefully", () => {
		const cusProduct = makeCusProduct({ productId: "prod_999" });
		const products = [makeProduct({ id: "prod_1" })];

		const plan = customerProductToCustomerStatePlan({ cusProduct, products });

		expect(plan.productId).toBe("prod_999");
		expect(plan.prepaidOptions).toEqual({});
		expect(plan.items).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// buildInitialValues
// ---------------------------------------------------------------------------

describe("buildInitialValues", () => {
	const products = [
		makeProduct({ id: "prod_1" }),
		makeProduct({ id: "prod_2", name: "Starter" }),
	];

	const withDates = ({
		customerProduct,
		startsAt,
		endedAt = null,
	}: {
		customerProduct: FullCusProduct;
		startsAt: number;
		endedAt?: number | null;
	}) =>
		({
			...customerProduct,
			starts_at: startsAt,
			ended_at: endedAt,
		}) as FullCusProduct;

	test("maps current and scheduled plans to phases, keeping the current phase's start", () => {
		const current = withDates({
			customerProduct: makeCusProduct({ id: "cp_1", productId: "prod_1" }),
			startsAt: 1000,
			endedAt: 2000,
		});
		const scheduled = withDates({
			customerProduct: makeCusProduct({
				id: "cp_2",
				productId: "prod_2",
				status: CusProductStatus.Scheduled,
			}),
			startsAt: 2000,
		});
		const customer = makeCustomer({ customerProducts: [current, scheduled] });

		const result = buildInitialValues({ customer, products, nowMs: 1500 });

		expect(
			result.phases.map((phase) => ({
				startsAt: phase.startsAt,
				persistedStartsAt: phase.persistedStartsAt,
				productIds: phase.plans.map((plan) => plan.productId),
			})),
		).toEqual([
			{ startsAt: 1000, persistedStartsAt: 1000, productIds: ["prod_1"] },
			{ startsAt: 2000, persistedStartsAt: 2000, productIds: ["prod_2"] },
		]);
		expect(result.unscheduledPlans).toEqual([]);
	});

	test("keeps ongoing plans next to scheduled plans", () => {
		const ongoing = withDates({
			customerProduct: makeCusProduct({
				id: "cp_ongoing",
				productId: "prod_1",
			}),
			startsAt: 500,
		});
		const pastDue = withDates({
			customerProduct: makeCusProduct({
				id: "cp_past_due",
				productId: "prod_2",
				status: CusProductStatus.PastDue,
			}),
			startsAt: 1000,
			endedAt: 2000,
		});
		const scheduled = withDates({
			customerProduct: makeCusProduct({
				id: "cp_scheduled",
				productId: "prod_2",
				status: CusProductStatus.Scheduled,
			}),
			startsAt: 2000,
		});
		const customer = makeCustomer({
			customerProducts: [ongoing, pastDue, scheduled],
		});

		const result = buildInitialValues({ customer, products, nowMs: 1500 });

		expect(result.unscheduledPlans.map((plan) => plan.productId)).toEqual([
			"prod_1",
		]);
		expect(result.phases[0].persistedStartsAt).toBe(1000);
		expect(result.phases[0].plans.map((plan) => plan.productId)).toEqual([
			"prod_2",
		]);
	});

	test("hydrates billing cycle reset state from scheduled plans", () => {
		const current = withDates({
			customerProduct: makeCusProduct({ id: "cp_1", productId: "prod_1" }),
			startsAt: 1000,
			endedAt: 2000,
		});
		const scheduled = {
			...withDates({
				customerProduct: makeCusProduct({
					id: "cp_2",
					productId: "prod_2",
					status: CusProductStatus.Scheduled,
				}),
				startsAt: 2000,
			}),
			billing_cycle_anchor_resets_at: 2000,
		} as FullCusProduct;
		const customer = makeCustomer({ customerProducts: [current, scheduled] });

		const result = buildInitialValues({ customer, products, nowMs: 1500 });

		expect(result.resetBillingCycle).toBe(true);
	});

	test("does not hydrate billing cycle reset state from a past reset", () => {
		const current = {
			...withDates({
				customerProduct: makeCusProduct({ id: "cp_1", productId: "prod_1" }),
				startsAt: 1000,
				endedAt: 2000,
			}),
			billing_cycle_anchor_resets_at: 1000,
		} as FullCusProduct;
		const scheduled = withDates({
			customerProduct: makeCusProduct({
				id: "cp_2",
				productId: "prod_2",
				status: CusProductStatus.Scheduled,
			}),
			startsAt: 2000,
		});
		const customer = makeCustomer({ customerProducts: [current, scheduled] });

		const result = buildInitialValues({ customer, products, nowMs: 1500 });

		expect(result.resetBillingCycle).toBe(false);
	});

	test("preserves custom items for custom scheduled plans", () => {
		const basePrice = makeFixedPrice({ amount: 4200 });
		const customScheduled = withDates({
			customerProduct: makeCusProduct({
				id: "cp_custom",
				productId: "prod_1",
				isCustom: true,
				status: CusProductStatus.Scheduled,
				customerPrices: [{ id: "cp_p1", price: basePrice } as any],
				customerEntitlements: [],
			}),
			startsAt: 2000,
		});
		const customer = makeCustomer({ customerProducts: [customScheduled] });

		const result = buildInitialValues({ customer, products, nowMs: 1500 });

		const plan = result.phases[1].plans[0];
		expect(plan.items).not.toBeNull();
		const priceItem = plan.items!.find(
			(item) => item.price != null && !item.feature_id,
		);
		expect(priceItem!.price).toBe(4200);
	});

	test("puts customer and entity plans starting together in one phase", () => {
		const customerPlan = withDates({
			customerProduct: makeCusProduct({
				id: "cp_1",
				productId: "prod_1",
				status: CusProductStatus.Scheduled,
			}),
			startsAt: 2000,
		});
		const entityPlan = {
			...withDates({
				customerProduct: makeCusProduct({
					id: "cp_3",
					productId: "prod_2",
					status: CusProductStatus.Scheduled,
				}),
				startsAt: 2000,
			}),
			entity_id: "ent_1",
		} as FullCusProduct;
		const customer = makeCustomer({
			customerProducts: [customerPlan, entityPlan],
		});

		const result = buildInitialValues({ customer, products, nowMs: 1500 });

		expect(result.phases[1].startsAt).toBe(2000);
		expect(result.phases[1].plans.map((plan) => plan.entityId)).toEqual([
			null,
			"ent_1",
		]);
	});

	test("seeds the current phase with live plans when nothing is scheduled", () => {
		const activeCp = makeCusProduct({ id: "cp_1", productId: "prod_1" });
		const customer = makeCustomer({ customerProducts: [activeCp] });

		const result = buildInitialValues({ customer, products });

		expect(result.phases).toHaveLength(1);
		expect(result.phases[0].startsAt).toBeNull();
		expect(result.phases[0].persistedStartsAt).toBeUndefined();
		expect(result.phases[0].plans.map((plan) => plan.productId)).toEqual([
			"prod_1",
		]);
		expect(result.unscheduledPlans).toEqual([]);
	});

	test("returns single empty plan when the customer has no plans", () => {
		const customer = makeCustomer({ customerProducts: [] });

		const result = buildInitialValues({ customer, products });

		expect(result.phases).toHaveLength(1);
		expect(result.phases[0].plans).toHaveLength(1);
		expect(result.phases[0].plans[0]).toEqual(EMPTY_CUSTOMER_STATE_PLAN);
	});

	test("with a subscription in focus, seeds its plans and the free plans only", () => {
		const onSubscription = (id: string, stripeSubscriptionId: string) =>
			({
				...makeCusProduct({
					id,
					productId: "prod_1",
					customerPrices: [{ price: makeFixedPrice() }],
				}),
				subscription_ids: [stripeSubscriptionId],
			}) as FullCusProduct;
		const customer = makeCustomer({
			customerProducts: [
				onSubscription("cp_picked", "sub_picked"),
				onSubscription("cp_other", "sub_other"),
				makeCusProduct({ id: "cp_free", productId: "prod_2" }),
			],
		});

		const result = buildInitialValues({
			customer,
			products,
			stripeSubscriptionId: "sub_picked",
		});

		expect(result.phases[0].plans.map((plan) => plan.productId)).toEqual([
			"prod_1",
			"prod_2",
		]);
	});

	test("with a subscription in focus, hides paid plans billed on no subscription", () => {
		const paidCustomerProduct = (id: string, productId: string) =>
			makeCusProduct({
				id,
				productId,
				customerPrices: [{ price: makeFixedPrice() }],
			});
		const customer = makeCustomer({
			customerProducts: [
				{
					...paidCustomerProduct("cp_picked", "prod_1"),
					subscription_ids: ["sub_picked"],
				} as FullCusProduct,
				paidCustomerProduct("cp_unlinked_paid", "prod_2"),
			],
		});

		const result = buildInitialValues({
			customer,
			products,
			stripeSubscriptionId: "sub_picked",
		});

		expect(result.phases[0].plans.map((plan) => plan.productId)).toEqual([
			"prod_1",
		]);
	});

	test("with a not-started schedule in focus, seeds its scheduled plans", () => {
		const startsAt = Date.now() + 86_400_000;
		const scheduledCustomerProduct = {
			...makeCusProduct({
				id: "cp_scheduled",
				productId: "prod_1",
				status: CusProductStatus.Scheduled,
				customerPrices: [{ price: makeFixedPrice() }],
			}),
			starts_at: startsAt,
			scheduled_ids: ["sub_sched_1"],
		} as FullCusProduct;
		const otherSubscriptionProduct = {
			...makeCusProduct({
				id: "cp_other",
				productId: "prod_2",
				customerPrices: [{ price: makeFixedPrice() }],
			}),
			subscription_ids: ["sub_other"],
		} as FullCusProduct;
		const customer = makeCustomer({
			customerProducts: [scheduledCustomerProduct, otherSubscriptionProduct],
		});

		const result = buildInitialValues({
			customer,
			products,
			stripeScheduleId: "sub_sched_1",
		});

		const seededProductIds = [
			...result.phases.flatMap((phase) => phase.plans),
			...result.unscheduledPlans,
		].map((plan) => plan.productId);
		expect(seededProductIds).toContain("prod_1");
		expect(seededProductIds).not.toContain("prod_2");
	});

	test("handles undefined customer gracefully", () => {
		const result = buildInitialValues({ customer: undefined, products });

		expect(result.phases).toHaveLength(1);
		expect(result.phases[0].plans).toHaveLength(1);
		expect(result.phases[0].plans[0]).toEqual(EMPTY_CUSTOMER_STATE_PLAN);
	});
});

// ---------------------------------------------------------------------------
// getActiveCustomerPlans
// ---------------------------------------------------------------------------

describe("getActiveCustomerPlans", () => {
	const products = [
		makeProduct({ id: "prod_1" }),
		makeProduct({ id: "prod_2", name: "Starter" }),
	];

	test("keeps only active, uncanceled customer products", () => {
		const activeCp = makeCusProduct({
			id: "cp_1",
			productId: "prod_1",
			status: CusProductStatus.Active,
		});
		const scheduledCp = makeCusProduct({
			id: "cp_2",
			productId: "prod_2",
			status: CusProductStatus.Scheduled,
		});
		const canceledCp = makeCusProduct({
			id: "cp_3",
			productId: "prod_2",
			status: CusProductStatus.Active,
		});
		(canceledCp as any).canceled_at = Date.now();
		const customer = makeCustomer({
			customerProducts: [activeCp, scheduledCp, canceledCp],
		});

		const plans = getActiveCustomerPlans({ customer, products });

		expect(plans).toHaveLength(1);
		expect(plans[0].productId).toBe("prod_1");
	});

	test("keeps each plan's own scope", () => {
		const entityCp = makeCusProduct({
			id: "cp_ent",
			productId: "prod_1",
			status: CusProductStatus.Active,
		});
		(entityCp as any).entity_id = "ent_1";
		const customerCp = makeCusProduct({
			id: "cp_cus",
			productId: "prod_2",
			status: CusProductStatus.Active,
		});
		(customerCp as any).entity_id = null;
		const customer = makeCustomer({ customerProducts: [entityCp, customerCp] });

		const plans = getActiveCustomerPlans({ customer, products });

		expect(plans.map((plan) => plan.entityId)).toEqual(["ent_1", null]);
	});

	test("returns nothing for an undefined customer", () => {
		expect(getActiveCustomerPlans({ customer: undefined, products })).toEqual(
			[],
		);
	});
});

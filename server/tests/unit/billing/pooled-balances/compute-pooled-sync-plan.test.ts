import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	EntInterval,
	type SyncBillingContext,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { entities } from "@tests/utils/fixtures/db/entities.js";
import { entitlements } from "@tests/utils/fixtures/db/entitlements.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import { computeSyncImmediatePhase } from "@/internal/billing/v2/actions/sync/compute/computeSyncImmediatePhase.js";
import { computeSyncPlan } from "@/internal/billing/v2/actions/sync/compute/computeSyncPlan.js";
import { handleSyncErrors } from "@/internal/billing/v2/actions/sync/errors/handleSyncErrors.js";

const CURRENT_EPOCH_MS = Date.UTC(2027, 0, 1);
const STARTS_AT = CURRENT_EPOCH_MS + 86_400_000;

const createSyncContext = ({
	paid = false,
	immediate = false,
	sourcePooled = true,
	stripeStatus = "active",
}: {
	paid?: boolean;
	immediate?: boolean;
	sourcePooled?: boolean;
	stripeStatus?: "active" | "past_due";
} = {}): SyncBillingContext => {
	const entity = entities.create({ id: "entity_one", featureId: "seats" });
	const pooledEntitlement = {
		...entitlements.create({
			id: "entitlement_messages",
			featureId: "messages",
			featureName: "Messages",
			allowance: 500,
			interval: EntInterval.Month,
		}),
		pooled: true,
	};
	const fullProduct = products.createFull({
		id: "pooled_pro",
		entitlements: [pooledEntitlement],
		prices: paid ? [prices.createFixed({ id: "price_pooled_pro" })] : [],
	});
	const currentCustomerEntitlement = customerEntitlements.create({
		id: "customer_entitlement_current",
		entitlementId: pooledEntitlement.id,
		featureId: "messages",
		featureName: "Messages",
		allowance: 500,
		balance: 200,
		customerProductId: "customer_product_current",
		interval: EntInterval.Month,
		nextResetAt: STARTS_AT,
	});
	currentCustomerEntitlement.entitlement = {
		...pooledEntitlement,
		pooled: sourcePooled,
	};
	currentCustomerEntitlement.reset_cycle_anchor = CURRENT_EPOCH_MS;
	const currentCustomerProduct = customerProducts.create({
		id: "customer_product_current",
		productId: "pooled_starter",
		customerEntitlements: [currentCustomerEntitlement],
		internalEntityId: entity.internal_id,
		entityId: entity.id ?? undefined,
		status: CusProductStatus.Active,
		startsAt: CURRENT_EPOCH_MS,
	});
	const fullCustomer = {
		...contexts.createBilling({
			customerProducts: [currentCustomerProduct],
			fullProducts: [fullProduct],
			currentEpochMs: CURRENT_EPOCH_MS,
		}).fullCustomer,
		entities: [entity],
	};

	return {
		customer_id: fullCustomer.id ?? fullCustomer.internal_id,
		fullCustomer,
		currency: "usd",
		stripeSubscription: immediate
			? ({
					id: "subscription_immediate_pooled",
					billing_cycle_anchor: CURRENT_EPOCH_MS / 1000,
					start_date: CURRENT_EPOCH_MS / 1000,
					status: stripeStatus,
					trial_end: null,
					canceled_at: null,
					cancel_at: null,
					ended_at: null,
				} as never)
			: null,
		stripeSchedule: { id: "sub_sched_pooled" } as never,
		immediatePhase: immediate
			? {
					startsAt: CURRENT_EPOCH_MS,
					endsAt: null,
					productContexts: [
						{
							plan: {
								plan_id: fullProduct.id,
								expire_previous: true,
							},
							fullProduct,
							customPrices: [],
							customEntitlements: [],
							featureQuantities: [],
							entity,
							currentCustomerProduct,
						},
					],
				}
			: null,
		futurePhases: immediate
			? []
			: [
					{
						startsAt: STARTS_AT,
						endsAt: null,
						productContexts: [
							{
								plan: {
									plan_id: fullProduct.id,
									expire_previous: true,
								},
								fullProduct,
								customPrices: [],
								customEntitlements: [],
								featureQuantities: [],
								entity,
								currentCustomerProduct,
							},
						],
					},
				],
		currentEpochMs: CURRENT_EPOCH_MS,
		acknowledgedWarnings: [],
		carryOverUsage: true,
	};
};

describe("pooled sync plans", () => {
	test("an immediate sync reapplies non-pooled usage through the pooled operation", () => {
		const syncContext = createSyncContext({
			immediate: true,
			sourcePooled: false,
		});

		const result = computeSyncImmediatePhase({
			ctx: contexts.create({}),
			syncContext,
		});

		expect(
			result.insertCustomerProducts[0]?.customer_entitlements[0]?.balance,
		).toBe(0);
		expect(result.pooledBalanceOps).toEqual([
			expect.objectContaining({
				op: "upsert_source",
				usageReapply: {
					amount: 300,
					excludedSourceCustomerProductId: "customer_product_current",
				},
			}),
		]);
	});

	test("future pooled entity phases pass validation after preparation support", () => {
		expect(() =>
			handleSyncErrors({ syncContext: createSyncContext() }),
		).not.toThrow();
	});

	test("future sources are zeroed without contributing and expired sources are removed", () => {
		const syncContext = createSyncContext();
		const result = computeSyncPlan({
			ctx: contexts.create({}),
			syncContext,
		});
		const insertedCustomerProduct =
			result.autumnBillingPlan.insertCustomerProducts[0];

		expect(insertedCustomerProduct?.status).toBe(CusProductStatus.Scheduled);
		expect(insertedCustomerProduct?.customer_entitlements[0]?.balance).toBe(0);
		expect(result.autumnBillingPlan.pooledBalanceOps).toEqual([
			expect.objectContaining({
				op: "remove_source",
				sourceCustomerProductId: "customer_product_current",
			}),
		]);
	});

	test("a future phase enabled immediately contributes at its access start", () => {
		const syncContext = createSyncContext();
		const productContext = syncContext.futurePhases[0]!.productContexts[0]!;
		productContext.accessStartsAt = CURRENT_EPOCH_MS;
		productContext.plan.enable_plan_immediately = true;

		handleSyncErrors({ syncContext });
		const result = computeSyncPlan({
			ctx: contexts.create({}),
			syncContext,
		});
		const insertedCustomerProduct =
			result.autumnBillingPlan.insertCustomerProducts[0];

		expect(insertedCustomerProduct?.status).toBe(CusProductStatus.Active);
		expect(insertedCustomerProduct?.customer_entitlements[0]?.balance).toBe(0);
		expect(result.autumnBillingPlan.pooledBalanceOps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					op: "upsert_source",
					sourceCustomerProductId: insertedCustomerProduct?.id,
					currentCycleContribution: 500,
				}),
			]),
		);
	});

	test("a paid schedule-only future source is prepared without a live subscription", () => {
		const syncContext = createSyncContext({ paid: true });

		handleSyncErrors({ syncContext });
		const result = computeSyncPlan({
			ctx: contexts.create({}),
			syncContext,
		});
		const insertedCustomerProduct =
			result.autumnBillingPlan.insertCustomerProducts[0];

		expect(insertedCustomerProduct?.status).toBe(CusProductStatus.Scheduled);
		expect(insertedCustomerProduct?.subscription_ids?.[0]).toBeUndefined();
		expect(insertedCustomerProduct?.customer_entitlements[0]?.balance).toBe(0);
		expect(
			result.autumnBillingPlan.pooledBalanceOps?.some(
				(operation) => operation.op === "upsert_source",
			),
		).toBe(false);
	});

	test("an immediately active paid source still requires a live subscription owner", () => {
		const syncContext = createSyncContext({ paid: true });
		const productContext = syncContext.futurePhases[0]!.productContexts[0]!;
		productContext.accessStartsAt = CURRENT_EPOCH_MS;
		productContext.plan.enable_plan_immediately = true;

		expect(() =>
			computeSyncPlan({
				ctx: contexts.create({}),
				syncContext,
			}),
		).toThrow("require a billing subscription reset owner");
	});

	test("a PastDue source remains live and contributes to its pooled balance", () => {
		const syncContext = createSyncContext({
			immediate: true,
			stripeStatus: "past_due",
		});

		const result = computeSyncImmediatePhase({
			ctx: contexts.create({}),
			syncContext,
		});

		expect(result.insertCustomerProducts[0]?.status).toBe(
			CusProductStatus.PastDue,
		);
		expect(result.pooledBalanceOps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					op: "upsert_source",
					currentCycleContribution: 500,
				}),
			]),
		);
	});
});

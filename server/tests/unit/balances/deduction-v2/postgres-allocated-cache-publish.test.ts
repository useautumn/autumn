import { afterAll, describe, expect, mock, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	BillWhen,
	FeatureUsageType,
	type FullSubject,
	PriceType,
} from "@autumn/shared";

import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

type SyncCacheCall = {
	cusEntUpdates?: Record<string, { balance?: number }>;
};

const mockState = {
	callOrder: [] as string[],
	syncCacheCalls: [] as SyncCacheCall[],
};

/**
 * Paid-allocated cusEnt: continuous-use feature priced end-of-period with
 * proration, i.e. exactly what `isUsageBasedAllocatedCustomerEntitlement`
 * matches and therefore what routes through `createAllocatedInvoice`.
 */
const allocatedCustomerEntitlement = {
	id: "cus_ent_1",
	customer_product_id: "cus_prod_1",
	balance: 0,
	additional_balance: 0,
	adjustment: 0,
	entities: null,
	next_reset_at: null,
	entitlement: {
		id: "ent_1",
		feature: {
			id: "users",
			internal_id: "feature_int_1",
			config: { usage_type: FeatureUsageType.Continuous },
		},
	},
	customer_product: {
		customer_prices: [
			{
				customer_product_id: "cus_prod_1",
				price: {
					id: "price_1",
					entitlement_id: "ent_1",
					config: {
						type: PriceType.Usage,
						bill_when: BillWhen.EndOfPeriod,
						should_prorate: true,
						interval: BillingInterval.Month,
						feature_id: "users",
						internal_feature_id: "feature_int_1",
						usage_tiers: [{ to: -1, amount: 10 }],
					},
				},
			},
		],
	},
};

await mockModuleWithRestore(
	"@/internal/balances/utils/deductionV2/prepareFeatureDeductionV2.js",
	() => ({
		prepareFeatureDeductionV2: () => ({
			customerEntitlementDeductions: [],
			spendLimitByFeatureId: null,
			usageBasedCusEntIdsByFeatureId: null,
			usageWindowLimits: null,
			usageWindowFeatureIds: [],
			rollovers: [],
			customerEntitlements: [allocatedCustomerEntitlement],
			unlimitedFeatureIds: [],
			unlimitedCusEnt: null,
			lock: null,
		}),
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/utils/allocatedInvoice/createAllocatedInvoice.js",
	() => ({
		createAllocatedInvoice: async () => {
			mockState.callOrder.push("createAllocatedInvoice");
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/utils/deductionV2/syncDeductionUpdatesToFullSubjectCache.js",
	() => ({
		syncDeductionUpdatesToFullSubjectCache: async (args: SyncCacheCall) => {
			mockState.callOrder.push("syncDeductionUpdatesToFullSubjectCache");
			mockState.syncCacheCalls.push(args);
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/utils/deductionV2/applyDeductionUpdateToFullSubject.js",
	() => ({ applyDeductionUpdateToFullSubject: () => undefined }),
);

await mockModuleWithRestore(
	"@/internal/balances/utils/deductionV2/applyRolloverUpdatesToFullSubject.js",
	() => ({ applyRolloverUpdatesToFullSubject: () => undefined }),
);

await mockModuleWithRestore(
	"@/internal/balances/utils/deductionV2/logDeductionUpdatesV2.js",
	() => ({ logDeductionUpdatesV2: () => undefined }),
);

await mockModuleWithRestore(
	"@/internal/balances/utils/deductionV2/mutationLogsToFeaturesV2.js",
	() => ({ mutationLogsToFeaturesV2: () => [] }),
);

await mockModuleWithRestore(
	"@/internal/balances/trackWebhooks/fireTrackWebhooks.js",
	() => ({
		fireTrackWebhooks: () => undefined,
	}),
);

const { executePostgresDeductionV2 } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/balances/utils/deductionV2/executePostgresDeductionV2.js?postgresAllocatedCachePublish"
);

const fullSubject = {
	customerId: "cus_1",
	internalCustomerId: "cus_int_1",
	entityId: undefined,
	customer: {} as never,
	customer_products: [],
	extra_customer_entitlements: [],
	pooled_customer_entitlements: [],
	invoices: [],
	subjectType: "customer",
} as unknown as FullSubject;

const buildCtx = () => ({
	org: { id: "org_1", config: {} },
	env: AppEnv.Sandbox,
	features: [],
	extraLogs: {},
	logger: {
		info: mock(() => {}),
		warn: mock(() => {}),
		error: mock(() => {}),
		debug: mock(() => {}),
	},
	db: {
		execute: async () => [
			{
				deduct_from_cus_ents: {
					updates: {
						cus_ent_1: {
							balance: -5,
							additional_balance: 0,
							adjustment: 0,
							entities: {},
							deducted: 5,
						},
					},
					remaining: 0,
					rollover_updates: [],
					mutation_logs: [],
				},
			},
		],
	},
});

describe("executePostgresDeductionV2 allocated invoice window", () => {
	test("publishes the Postgres deduction to the balance cache before the allocated Stripe round trip", async () => {
		mockState.callOrder = [];
		mockState.syncCacheCalls = [];

		await executePostgresDeductionV2({
			ctx: buildCtx() as never,
			fullSubject: structuredClone(fullSubject),
			customerId: "cus_1",
			deductions: [
				{
					feature: allocatedCustomerEntitlement.entitlement.feature,
					deduction: 5,
				},
			] as never,
		});

		// The cache must already carry the deduction when createAllocatedInvoice
		// starts: the Stripe webhooks that round trip fires flush the cached
		// balances back into Postgres, so a pre-deduction cache would erase it.
		expect(mockState.callOrder[0]).toBe(
			"syncDeductionUpdatesToFullSubjectCache",
		);
		expect(mockState.callOrder).toContain("createAllocatedInvoice");
		expect(
			mockState.callOrder.indexOf("createAllocatedInvoice"),
		).toBeGreaterThan(0);

		// And the published entry is the post-deduction balance, not the old one.
		expect(mockState.syncCacheCalls[0]?.cusEntUpdates?.cus_ent_1?.balance).toBe(
			-5,
		);
	});
});

afterAll(() => {
	mock.restore();
});

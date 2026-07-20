import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
} from "@autumn/shared";
import type { PreparedCustomerLicenseTransition } from "@/internal/billing/v2/execute/executeAutumnActions/executeCustomerLicenseTransitions.js";

let pooledLifecycleCalls = 0;
let outsideTransactionInserts = 0;
let outsideTransactionUpdates = 0;
let outsideTransactionDeletes = 0;
let outsideTransactionPatches = 0;
let executionOrder: string[] = [];
let reconcileCalls: Array<{ flushBalances?: boolean }> = [];
let preparedLicenseTransitions: PreparedCustomerLicenseTransition[] = [];
let lifecyclePlan: AutumnBillingPlan | undefined;
let standaloneLicenseTransitionCalls = 0;

mock.module(
	"@/internal/billing/v2/execute/executeAutumnActions/executePooledPlanCustomerProductLifecycle.js",
	() => ({
		executePooledPlanCustomerProductLifecycle: async ({
			autumnBillingPlan,
			afterCustomerProductInserts,
			beforeRebalance,
		}: {
			autumnBillingPlan: AutumnBillingPlan;
			afterCustomerProductInserts?: ({ db }: { db: never }) => Promise<void>;
			beforeRebalance?: ({ db }: { db: never }) => Promise<void>;
		}) => {
			pooledLifecycleCalls += 1;
			lifecyclePlan = autumnBillingPlan;
			executionOrder.push("pooled lifecycle");
			await afterCustomerProductInserts?.({ db: {} as never });
			await beforeRebalance?.({ db: {} as never });
			return Boolean(autumnBillingPlan.pooledBalanceOps?.length);
		},
	}),
);
mock.module(
	"@/internal/licenses/actions/reconcile/reconcileLicenseState.js",
	() => ({
		reconcileLicenseStateForCustomer: async ({
			flushBalances,
		}: {
			flushBalances?: boolean;
		}) => {
			reconcileCalls.push({ flushBalances });
		},
	}),
);
mock.module(
	"@/internal/billing/v2/execute/executeAutumnActions/executePatchCustomerProducts",
	() => ({
		executePatchCustomerProducts: async () => {
			outsideTransactionPatches += 1;
			executionOrder.push("outside patch");
		},
	}),
);
mock.module(
	"@/internal/billing/v2/execute/executeAutumnActions/insertNewCusProducts",
	() => ({
		insertNewCusProducts: async () => {
			outsideTransactionInserts += 1;
		},
	}),
);
mock.module(
	"@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js",
	() => ({ executePooledBalanceOps: async () => {} }),
);
mock.module(
	"@/internal/billing/v2/execute/executeAutumnActions/executeInsertPlanLicenses",
	() => ({
		executeInsertPlanLicenses: async () => {
			executionOrder.push("insert plan licenses");
		},
	}),
);
mock.module(
	"@/internal/billing/v2/execute/executeAutumnActions/executeCustomerLicenseUpdates",
	() => ({
		executeCustomerLicenseUpdates: async () => {
			executionOrder.push("customer license updates");
		},
	}),
);
mock.module(
	"@/internal/billing/v2/execute/executeAutumnActions/executeCustomerLicenseTransitions",
	() => ({
		executeCustomerLicenseTransitions: async () => {
			standaloneLicenseTransitionCalls += 1;
			executionOrder.push("customer license transitions");
		},
		prepareCustomerLicenseTransitions: async () => preparedLicenseTransitions,
		executePreparedCustomerLicenseTransitionRows: async () => {
			executionOrder.push("license transition rows");
		},
		restorePreparedCustomerLicenseEntitlements: async () => {
			executionOrder.push("license entitlement restore");
		},
		triggerPreparedCustomerLicenseBatchTransitions: async () => {
			executionOrder.push("license batch trigger");
		},
	}),
);
mock.module(
	"@/internal/billing/v2/execute/executeAutumnActions/updateCustomerEntitlements",
	() => ({ updateCustomerEntitlements: async () => {} }),
);
mock.module(
	"@/internal/customers/schedules/repos/replaceScheduledPhaseCustomerProductIds",
	() => ({ replaceScheduledPhaseCustomerProductIds: async () => {} }),
);
mock.module("@/internal/customers/cusProducts/CusProductService", () => ({
	ACTIVE_STATUSES: [],
	RELEVANT_STATUSES: [],
	CusProductService: {
		update: async () => {
			outsideTransactionUpdates += 1;
		},
		delete: async () => {
			outsideTransactionDeletes += 1;
		},
	},
}));

afterAll(() => {
	mock.restore();
});

beforeEach(() => {
	pooledLifecycleCalls = 0;
	outsideTransactionInserts = 0;
	outsideTransactionUpdates = 0;
	outsideTransactionDeletes = 0;
	outsideTransactionPatches = 0;
	executionOrder = [];
	reconcileCalls = [];
	preparedLicenseTransitions = [];
	lifecyclePlan = undefined;
	standaloneLicenseTransitionCalls = 0;
});

const createCustomerProduct = ({ id }: { id: string }) =>
	({
		id,
		product: { id: `product_${id}` },
		customer_entitlements: [],
		customer_prices: [],
	}) as unknown as FullCusProduct;

test("pooled plans execute customer-product mutations only through the locked lifecycle", async () => {
	const sourceCustomerProduct = createCustomerProduct({ id: "source" });
	const autumnBillingPlan = {
		customerId: "customer_one",
		insertCustomerProducts: [sourceCustomerProduct],
		updateCustomerProducts: [
			{
				customerProduct: sourceCustomerProduct,
				updates: { status: CusProductStatus.Active },
			},
		],
		deleteCustomerProducts: [
			createCustomerProduct({ id: "scheduled_product" }),
		],
		patchCustomerProducts: [
			{
				customerProduct: sourceCustomerProduct,
				insertCustomerEntitlements: [],
				insertCustomerPrices: [],
				deleteCustomerEntitlements: [],
				deleteCustomerPrices: [],
			},
		],
		pooledBalanceOps: [
			{
				op: "remove_source",
				internalCustomerId: "internal_customer_one",
				sourceCustomerProductId: "source",
				effectiveAt: null,
			},
		],
	} satisfies AutumnBillingPlan;
	const { executeAutumnBillingPlan } = await import(
		// @ts-expect-error - Bun test cache-busting import isolates this file's module mocks.
		"@/internal/billing/v2/execute/executeAutumnBillingPlan.js?pooledPlanExecutorWiring"
	);

	await executeAutumnBillingPlan({
		ctx: {
			db: {} as never,
			logger: { debug: () => {} },
		} as never,
		autumnBillingPlan,
	});

	expect(pooledLifecycleCalls).toBe(1);
	expect(outsideTransactionInserts).toBe(0);
	expect(outsideTransactionUpdates).toBe(0);
	expect(outsideTransactionDeletes).toBe(0);
	expect(outsideTransactionPatches).toBe(0);
	expect(executionOrder.slice(0, 3)).toEqual([
		"insert plan licenses",
		"pooled lifecycle",
		"customer license transitions",
	]);
	expect(reconcileCalls).toEqual([{ flushBalances: true }]);
});

test("non-pooled plans preserve the existing patch execution path", async () => {
	const sourceCustomerProduct = createCustomerProduct({ id: "non_pooled" });
	const autumnBillingPlan = {
		customerId: "customer_one",
		insertCustomerProducts: [],
		patchCustomerProducts: [
			{
				customerProduct: sourceCustomerProduct,
				insertCustomerEntitlements: [],
				insertCustomerPrices: [],
				deleteCustomerEntitlements: [],
				deleteCustomerPrices: [],
			},
		],
	} satisfies AutumnBillingPlan;
	const { executeAutumnBillingPlan } = await import(
		// @ts-expect-error - Bun test cache-busting import isolates this file's module mocks.
		"@/internal/billing/v2/execute/executeAutumnBillingPlan.js?pooledPlanExecutorWiring"
	);

	await executeAutumnBillingPlan({
		ctx: {
			db: {} as never,
			logger: { debug: () => {} },
		} as never,
		autumnBillingPlan,
	});

	expect(pooledLifecycleCalls).toBe(1);
	expect(outsideTransactionPatches).toBe(1);
	expect(executionOrder.slice(0, 5)).toEqual([
		"insert plan licenses",
		"outside patch",
		"customer license updates",
		"pooled lifecycle",
		"customer license transitions",
	]);
	expect(reconcileCalls).toEqual([{ flushBalances: false }]);
});

test("pooled license transition operations and row mutations share the pooled lifecycle", async () => {
	const sourceCustomerProduct = createCustomerProduct({ id: "license_parent" });
	const transitionOperation = {
		op: "remove_source" as const,
		internalCustomerId: "internal_customer_one",
		sourceCustomerProductId: "license_assignment",
		effectiveAt: null,
	};
	preparedLicenseTransitions = [
		{
			transition: {} as never,
			fullCustomerId: "customer_one",
			operations: [transitionOperation],
			pooledTargetCustomerEntitlementMutations: [],
			restoredCustomerEntitlements: [],
		},
	];
	const autumnBillingPlan = {
		customerId: "customer_one",
		insertCustomerProducts: [sourceCustomerProduct],
		customerLicenseTransitions: [{} as never],
	} satisfies AutumnBillingPlan;
	const { executeAutumnBillingPlan } = await import(
		// @ts-expect-error - Bun test cache-busting import isolates this file's module mocks.
		"@/internal/billing/v2/execute/executeAutumnBillingPlan.js?pooledPlanExecutorWiring"
	);

	await executeAutumnBillingPlan({
		ctx: {
			db: {} as never,
			logger: { debug: () => {} },
		} as never,
		autumnBillingPlan,
	});

	expect(lifecyclePlan?.pooledBalanceOps).toEqual([transitionOperation]);
	expect(standaloneLicenseTransitionCalls).toBe(0);
	expect(executionOrder).toEqual(
		expect.arrayContaining([
			"pooled lifecycle",
			"license transition rows",
			"license entitlement restore",
			"license batch trigger",
		]),
	);
	expect(executionOrder.indexOf("license transition rows")).toBeGreaterThan(
		executionOrder.indexOf("pooled lifecycle"),
	);
	expect(executionOrder.indexOf("license batch trigger")).toBeGreaterThan(
		executionOrder.indexOf("license entitlement restore"),
	);
	expect(reconcileCalls).toEqual([{ flushBalances: true }]);
});

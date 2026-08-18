/** Pre-fix, each matched product computes from the same stale pool state and inserts another pool.
 * Post-fix, every product computes from the projection produced by the previous product. */

import { beforeEach, expect, test } from "bun:test";
import type {
	AutumnBillingPlan,
	FullCusProduct,
	FullCustomer,
	FullCustomerEntitlement,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/index.js";
import { makeFullCusProduct } from "../billing/billing-change-response/helpers/makeFullCusProduct.js";
import { makeFullCustomer } from "../billing/billing-change-response/helpers/makeFullCustomer.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const state = {
	computeCount: 0,
	projectedCustomers: [] as FullCustomer[],
};

const emptyPlan = (): AutumnBillingPlan => ({
	customerId: "customer",
	insertCustomerProducts: [],
});

const insertedPoolPlan = ({ id }: { id: string }): AutumnBillingPlan => {
	const pooledCustomerEntitlement = {
		id,
		pooled_balance: { id },
	} as FullCustomerEntitlement;

	return {
		...emptyPlan(),
		pooledBalancePlan: {
			insertPoolBalances: [pooledCustomerEntitlement],
			updatePoolBalances: [],
			expirePoolBalanceCandidates: [],
			insertPoolRollovers: [],
			insertPoolContributions: [],
			updatePoolContributions: [],
			deletePoolContributions: [],
		},
	};
};

await mockModuleWithRestore(
	"@/internal/migrations/v2/operations/utils/index.js",
	() => ({
		appendMigrationBillingLog: () => undefined,
		filterCustomerProductsByPlanFilter: ({
			customerProducts,
		}: {
			customerProducts: FullCusProduct[];
		}) => ({ customerProducts }),
	}),
);

await mockModuleWithRestore(
	"@/internal/migrations/v2/operations/updatePlan/setup/index.js",
	() => ({
		setupUpdatePlanProductContext: async ({
			projectedFullCustomer,
		}: {
			projectedFullCustomer: FullCustomer;
		}) => {
			state.projectedCustomers.push(projectedFullCustomer);
			return {
				billingContext: {
					fullCustomer: projectedFullCustomer,
				} as UpdateSubscriptionBillingContext,
				params: {},
				preparedIds: {
					priceIds: new Set<string>(),
					entitlementIds: new Set<string>(),
				},
			};
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/billing/v2/actions/updateSubscription/compute/computeUpdateSubscriptionPlan.js",
	() => ({
		computeUpdateSubscriptionPlan: async ({
			billingContext,
		}: {
			billingContext: UpdateSubscriptionBillingContext;
		}) => {
			const hasProjectedPool =
				billingContext.fullCustomer.pooled_customer_entitlements?.length;
			if (hasProjectedPool) return emptyPlan();

			state.computeCount += 1;
			return insertedPoolPlan({ id: `pool-${state.computeCount}` });
		},
	}),
);

import { processUpdatePlan } from "@/internal/migrations/v2/operations/updatePlan/processUpdatePlan.js";

const expectOneProjectedPool = ({
	result,
}: {
	result: Awaited<ReturnType<typeof processUpdatePlan>>;
}) => {
	expect(
		result.plan.pooledBalancePlan?.insertPoolBalances.map(({ id }) => id),
	).toEqual(["pool-1"]);
	expect(
		state.projectedCustomers[1]?.pooled_customer_entitlements?.map(
			({ id }) => id,
		),
	).toEqual(["pool-1"]);
	expect(
		result.projectedFullCustomer.pooled_customer_entitlements?.map(
			({ id }) => id,
		),
	).toEqual(["pool-1"]);
};

beforeEach(() => {
	state.computeCount = 0;
	state.projectedCustomers = [];
});

test("update_plan reuses the projected pool across matched customer products", async () => {
	const customerProducts = [
		makeFullCusProduct({ id: "customer-product-1", planId: "plan" }),
		makeFullCusProduct({ id: "customer-product-2", planId: "plan" }),
	];
	const fullCustomer = makeFullCustomer({
		id: "customer",
		customerProducts,
	});
	fullCustomer.pooled_customer_entitlements = [];

	const result = await processUpdatePlan({
		ctx: {} as AutumnContext,
		context: { fullCustomer } as MigrateCustomerContext,
		op: {
			type: "update_plan",
			plan_filter: { plan_id: "plan" },
		},
		opIndex: 0,
		plan: emptyPlan(),
		projectedFullCustomer: fullCustomer,
	});

	expectOneProjectedPool({ result });
});

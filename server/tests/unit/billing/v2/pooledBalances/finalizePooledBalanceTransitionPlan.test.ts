import { expect, test } from "bun:test";
import type {
	DbPooledBalanceContribution,
	InsertPooledBalanceContribution,
} from "@autumn/shared";
import { finalizePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/finalizePooledBalanceTransitionPlan";
import type { PooledBalanceComputeContext } from "@/internal/billing/v2/pooledBalances/compute/types/pooledBalanceComputeTypes";

const NOW = 1_700_000_000_000;

const currentContribution = ({
	id = "current",
	poolId = "pool",
	sourceEntitlementId = "source-entitlement",
	current = 100,
	next = 100,
}: {
	id?: string;
	poolId?: string;
	sourceEntitlementId?: string;
	current?: number;
	next?: number;
} = {}): DbPooledBalanceContribution => ({
	id,
	pooled_balance_id: poolId,
	source_customer_product_id: "source-product",
	source_customer_entitlement_id: sourceEntitlementId,
	current_contribution: current,
	next_cycle_contribution: next,
	effective_at: null,
	created_at: 1,
	updated_at: 1,
});

const insertedContribution = ({
	id = "inserted",
	poolId = "pool",
	sourceEntitlementId = "source-entitlement",
	current = 100,
	next = 100,
}: {
	id?: string;
	poolId?: string;
	sourceEntitlementId?: string;
	current?: number;
	next?: number;
} = {}): InsertPooledBalanceContribution => ({
	id,
	pooled_balance_id: poolId,
	source_customer_product_id: "source-product",
	source_customer_entitlement_id: sourceEntitlementId,
	current_contribution: current,
	next_cycle_contribution: next,
	effective_at: null,
	created_at: 2,
	updated_at: 2,
});

const transitionContext = ({
	current,
	incoming,
}: {
	current: DbPooledBalanceContribution;
	incoming: InsertPooledBalanceContribution;
}): PooledBalanceComputeContext => ({
	plan: {
		insertPoolBalances: [],
		updatePoolBalances: [],
		expirePoolBalanceCandidates: [],
		insertPoolRollovers: [],
		insertPoolContributions: [incoming],
		updatePoolContributions: [],
		deletePoolContributions: [current],
	},
	pooledCustomerEntitlements: [],
	pooledCustomerEntitlementByPoolId: new Map(),
	pooledCustomerEntitlementByIdentity: new Map(),
	pooledBalanceIdsWithRemovedContributions: new Set(),
});

test("identical contribution replacement finalizes to a no-op", () => {
	const result = finalizePooledBalanceTransitionPlan({
		computeContext: transitionContext({
			current: currentContribution(),
			incoming: insertedContribution(),
		}),
		now: NOW,
	});

	expect(result).toBeUndefined();
});

test("changed contribution replacement preserves the existing row", () => {
	const result = finalizePooledBalanceTransitionPlan({
		computeContext: transitionContext({
			current: currentContribution(),
			incoming: insertedContribution({
				poolId: "new-pool",
				current: 200,
				next: 200,
			}),
		}),
		now: NOW,
	});

	expect(result?.insertPoolContributions).toEqual([]);
	expect(result?.deletePoolContributions).toEqual([]);
	expect(result?.updatePoolContributions).toEqual([
		{
			...currentContribution(),
			pooled_balance_id: "new-pool",
			current_contribution: 200,
			next_cycle_contribution: 200,
			updated_at: 2,
		},
	]);
});

test("different sources remain independent insert and delete operations", () => {
	const result = finalizePooledBalanceTransitionPlan({
		computeContext: transitionContext({
			current: currentContribution({ sourceEntitlementId: "outgoing" }),
			incoming: insertedContribution({ sourceEntitlementId: "incoming" }),
		}),
		now: NOW,
	});

	expect(result?.insertPoolContributions).toHaveLength(1);
	expect(result?.updatePoolContributions).toEqual([]);
	expect(result?.deletePoolContributions).toHaveLength(1);
});

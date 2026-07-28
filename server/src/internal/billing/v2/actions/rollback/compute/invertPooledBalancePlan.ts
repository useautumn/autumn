import type {
	DbPooledBalanceContribution,
	InsertPooledBalanceContribution,
	PooledBalancePlan,
} from "@autumn/shared";
import {
	emptyPooledBalancePlan,
	pooledBalancePlanHasChanges,
} from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan";

const toDeletableContribution = (
	contribution: InsertPooledBalanceContribution,
): DbPooledBalanceContribution => ({
	...contribution,
	current_contribution: contribution.current_contribution ?? 0,
	next_cycle_contribution: contribution.next_cycle_contribution ?? 0,
	effective_at: contribution.effective_at ?? null,
	created_at: contribution.created_at ?? 0,
	updated_at: contribution.updated_at ?? 0,
});

/** Inverts inserted pools/contributions and delta updates; sections that
 * destroyed unrecorded state are rejected upstream by the rollback guard. */
export const invertPooledBalancePlan = ({
	pooledBalancePlan,
}: {
	pooledBalancePlan?: PooledBalancePlan;
}): PooledBalancePlan | undefined => {
	if (
		!pooledBalancePlan ||
		!pooledBalancePlanHasChanges({ pooledBalancePlan })
	) {
		return undefined;
	}

	const insertedPoolCustomerEntitlementIds = new Set(
		pooledBalancePlan.insertPoolBalances.map(({ id }) => id),
	);

	return {
		...emptyPooledBalancePlan(),
		// Lifecycle fields on pooled_balance re-write the same values; only deltas invert.
		updatePoolBalances: pooledBalancePlan.updatePoolBalances
			.filter(
				({ pooledCustomerEntitlement }) =>
					!insertedPoolCustomerEntitlementIds.has(pooledCustomerEntitlement.id),
			)
			.slice()
			.reverse()
			.map((update) => ({
				...update,
				balanceDelta: -update.balanceDelta,
				grantedDelta: -update.grantedDelta,
			})),
		deletePoolContributions: pooledBalancePlan.insertPoolContributions
			.slice()
			.reverse()
			.map(toDeletableContribution),
		deletePoolBalances: pooledBalancePlan.insertPoolBalances.slice().reverse(),
	};
};

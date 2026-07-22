import type { AutumnBillingPlan, PooledBalancePlan } from "@autumn/shared";

export const emptyPooledBalancePlan = (): PooledBalancePlan => ({
	insertPoolBalances: [],
	updatePoolBalances: [],
	insertPoolContributions: [],
	updatePoolContributions: [],
	deletePoolContributions: [],
});

export const pooledBalancePlanHasChanges = ({
	pooledBalancePlan,
}: {
	pooledBalancePlan?: PooledBalancePlan;
}) =>
	Boolean(
		pooledBalancePlan &&
			(pooledBalancePlan.insertPoolBalances.length > 0 ||
				pooledBalancePlan.updatePoolBalances.length > 0 ||
				pooledBalancePlan.insertPoolContributions.length > 0 ||
				pooledBalancePlan.updatePoolContributions.length > 0 ||
				pooledBalancePlan.deletePoolContributions.length > 0),
	);

export const getChangedPooledBalances = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}) => [
	...(autumnBillingPlan.pooledBalancePlan?.insertPoolBalances ?? []),
	...(autumnBillingPlan.pooledBalancePlan?.updatePoolBalances ?? []).map(
		(update) => update.pooledCustomerEntitlement,
	),
];

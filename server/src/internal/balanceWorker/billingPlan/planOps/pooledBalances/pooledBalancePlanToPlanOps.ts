import {
	type BillingPlanOp,
	toBillingPlanDeleteOp,
	toBillingPlanIncrementOp,
	toBillingPlanInsertOp,
	toBillingPlanUpdateOp,
} from "@autumn/balance-engine";
import type {
	AutumnBillingPlan,
	DbPooledBalanceContribution,
	FullCustomerEntitlement,
	InsertPooledBalanceContribution,
	PooledBalancePlan,
} from "@autumn/shared";

const insertPoolBalanceToPlanOps = ({
	pooledCustomerEntitlement,
}: {
	pooledCustomerEntitlement: FullCustomerEntitlement;
}): BillingPlanOp[] => {
	const { pooled_balance: pooledBalance } = pooledCustomerEntitlement;
	if (!pooledBalance) return [];
	return [
		toBillingPlanInsertOp({
			table: "customerEntitlements",
			row: {
				...pooledCustomerEntitlement,
				balance: pooledCustomerEntitlement.balance ?? 0,
				pooled_balance_id: pooledBalance.id,
				pooled_contribution_id: null,
			},
		}),
		toBillingPlanInsertOp({ table: "pooledBalances", row: pooledBalance }),
	];
};

const updatePoolBalanceToPlanOps = ({
	pooledCustomerEntitlement,
	balanceDelta,
	grantedDelta,
}: PooledBalancePlan["updatePoolBalances"][number]): BillingPlanOp[] => {
	const { pooled_balance: pooledBalance } = pooledCustomerEntitlement;
	if (!pooledBalance) return [];
	return [
		...(balanceDelta !== 0
			? [
					toBillingPlanIncrementOp({
						id: pooledCustomerEntitlement.id,
						add: { balance: balanceDelta },
					}),
				]
			: []),
		toBillingPlanUpdateOp({
			table: "pooledBalances",
			id: pooledBalance.id,
			set: {
				reset_cycle_anchor: pooledBalance.reset_cycle_anchor,
				stripe_subscription_id: pooledBalance.stripe_subscription_id,
				customer_license_link_id: pooledBalance.customer_license_link_id,
			},
		}),
		...(grantedDelta !== 0
			? [
					toBillingPlanIncrementOp({
						table: "pooledBalances",
						id: pooledBalance.id,
						add: { granted: grantedDelta },
					}),
				]
			: []),
	];
};

const contributionWithTableDefaults = (
	contribution: InsertPooledBalanceContribution,
) => ({
	...contribution,
	current_contribution: contribution.current_contribution ?? 0,
	next_cycle_contribution: contribution.next_cycle_contribution ?? 0,
	effective_at: contribution.effective_at ?? null,
	created_at: contribution.created_at ?? contribution.updated_at ?? Date.now(),
	updated_at: contribution.updated_at ?? contribution.created_at ?? Date.now(),
});

const updateContributionToPlanOps = ({
	id,
	pooled_balance_id: _pooledBalanceId,
	...set
}: DbPooledBalanceContribution): BillingPlanOp =>
	toBillingPlanUpdateOp({ table: "pooledContributions", id, set });

const deleteContributionToPlanOps = (
	contribution: DbPooledBalanceContribution,
): BillingPlanOp =>
	toBillingPlanDeleteOp({
		table: "pooledContributions",
		id: contribution.id,
		share: {
			pooledBalanceId: contribution.pooled_balance_id,
			sourceCustomerEntitlementId: contribution.source_customer_entitlement_id,
		},
	});

const deletePoolBalanceToPlanOps = ({
	pooledCustomerEntitlement,
}: {
	pooledCustomerEntitlement: FullCustomerEntitlement;
}): BillingPlanOp[] => {
	const { pooled_balance: pooledBalance } = pooledCustomerEntitlement;
	if (!pooledBalance) return [];
	return [
		toBillingPlanDeleteOp({ table: "pooledBalances", id: pooledBalance.id }),
		toBillingPlanDeleteOp({
			table: "customerEntitlements",
			id: pooledCustomerEntitlement.id,
		}),
	];
};

export const pooledBalancePlanToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] => {
	const pooledBalancePlan = autumnBillingPlan.pooledBalancePlan;
	if (!pooledBalancePlan) return [];
	return [
		...pooledBalancePlan.insertPoolBalances.flatMap(
			(pooledCustomerEntitlement) =>
				insertPoolBalanceToPlanOps({ pooledCustomerEntitlement }),
		),
		...pooledBalancePlan.updatePoolBalances.flatMap(updatePoolBalanceToPlanOps),
		...pooledBalancePlan.insertPoolContributions.map((contribution) =>
			toBillingPlanInsertOp({
				table: "pooledContributions",
				row: contributionWithTableDefaults(contribution),
			}),
		),
		...pooledBalancePlan.insertPoolRollovers.map((rollover) =>
			toBillingPlanInsertOp({ table: "rollovers", row: rollover }),
		),
		...pooledBalancePlan.updatePoolContributions.map(
			updateContributionToPlanOps,
		),
		...pooledBalancePlan.deletePoolContributions.map(
			deleteContributionToPlanOps,
		),
		...(pooledBalancePlan.deletePoolBalances ?? []).flatMap(
			(pooledCustomerEntitlement) =>
				deletePoolBalanceToPlanOps({ pooledCustomerEntitlement }),
		),
	];
};

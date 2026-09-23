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

/** POOL_CE with the balance as computed, then the pool row. */
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

/** The pool's totals move by the plan's deltas, as the Postgres lane adds them; its lifecycle columns are set. */
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

/** An insert row may leave columns to their Postgres defaults; the worker carries them filled in. */
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

/** The share replaced whole, as the Postgres lane sets it. */
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

/** A rolled-back pool graph: the pool row, then POOL_CE; its shares cascade in Postgres and are not state. */
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

/**
 * The pooled plan as worker ops, in the order the Postgres lane writes it. Expiry candidates send nothing:
 * the worker asks Postgres which pools lost their last share and expires those itself.
 */
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

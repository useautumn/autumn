import type {
	DbPooledBalanceContribution,
	InsertPooledBalanceContribution,
	PooledBalancePlan,
} from "@autumn/shared";
import type { MutablePooledCustomerEntitlement } from "../types/pooledBalanceComputeTypes";

export type PoolShare = Pick<
	InsertPooledBalanceContribution,
	"pooled_balance_id" | "current_contribution" | "unlimited"
>;

type WrittenContribution =
	| InsertPooledBalanceContribution
	| DbPooledBalanceContribution;

/** A kind of share once the plan lands: removed ones gone, written ones at their new value, ones of another kind dropped. */
export const sharesAfterPlan = ({
	sharesBefore,
	plan,
	isShare,
}: {
	sharesBefore: Map<string, PoolShare>;
	plan: PooledBalancePlan;
	isShare: (contribution: WrittenContribution) => boolean;
}) => {
	const bySource = new Map<string, PoolShare>(sharesBefore);
	for (const contribution of plan.deletePoolContributions) {
		bySource.delete(contribution.source_customer_entitlement_id);
	}
	const written: WrittenContribution[] = [
		...plan.insertPoolContributions,
		...plan.updatePoolContributions,
	];
	for (const contribution of written) {
		if (isShare(contribution)) {
			bySource.set(contribution.source_customer_entitlement_id, contribution);
		} else {
			bySource.delete(contribution.source_customer_entitlement_id);
		}
	}
	return bySource.values();
};

/** Flips the pool's unlimited flag on its synthetic customer entitlement; the pool identity keeps `unlimited: false`. */
export const setPoolUnlimited = ({
	plan,
	pooledCustomerEntitlement,
	unlimited,
}: {
	plan: PooledBalancePlan;
	pooledCustomerEntitlement: MutablePooledCustomerEntitlement;
	unlimited: boolean;
}) => {
	pooledCustomerEntitlement.unlimited = unlimited;
	const isInserted = plan.insertPoolBalances.some(
		({ id }) => id === pooledCustomerEntitlement.id,
	);
	if (isInserted) return;

	const update = plan.updatePoolBalances.find(
		(candidate) =>
			candidate.pooledCustomerEntitlement.id === pooledCustomerEntitlement.id,
	);
	if (update) {
		update.unlimited = unlimited;
		return;
	}
	plan.updatePoolBalances.push({
		pooledCustomerEntitlement,
		balanceDelta: 0,
		grantedDelta: 0,
		unlimited,
	});
};

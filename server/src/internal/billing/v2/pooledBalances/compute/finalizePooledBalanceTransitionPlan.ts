import type {
	DbPooledBalanceContribution,
	InsertPooledBalanceContribution,
	PooledBalancePlan,
} from "@autumn/shared";
import { pooledBalancePlanHasChanges } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan";
import type { PooledBalanceComputeContext } from "./types/pooledBalanceComputeTypes";
import { addToExpirePoolBalanceCandidates } from "./utils/pooledBalancePlanUtils";

const contributionValuesMatch = ({
	current,
	incoming,
}: {
	current: DbPooledBalanceContribution;
	incoming: InsertPooledBalanceContribution;
}) =>
	current.pooled_balance_id === incoming.pooled_balance_id &&
	current.current_contribution === incoming.current_contribution &&
	current.next_cycle_contribution === incoming.next_cycle_contribution &&
	(current.effective_at ?? null) === (incoming.effective_at ?? null);

const toContributionUpdate = ({
	current,
	incoming,
}: {
	current: DbPooledBalanceContribution;
	incoming: InsertPooledBalanceContribution;
}): DbPooledBalanceContribution => ({
	...current,
	pooled_balance_id: incoming.pooled_balance_id,
	current_contribution: incoming.current_contribution ?? 0,
	next_cycle_contribution: incoming.next_cycle_contribution ?? 0,
	effective_at: incoming.effective_at ?? null,
	updated_at: incoming.updated_at ?? current.updated_at,
});

/** Flags pools that lost a contribution. Whether they are actually empty is
 * decided at execution — the remaining count is unbounded, so only the DB knows. */
const collectExpiryCandidates = ({
	computeContext,
	finalizedPlan,
	now,
}: {
	computeContext: PooledBalanceComputeContext;
	finalizedPlan: PooledBalancePlan;
	now: number;
}) => {
	for (const poolId of computeContext.pooledBalanceIdsWithRemovedContributions) {
		const pooledCustomerEntitlement =
			computeContext.pooledCustomerEntitlementByPoolId.get(poolId);
		if (!pooledCustomerEntitlement) continue;

		const isNewlyInserted = finalizedPlan.insertPoolBalances.some(
			(inserted) => inserted.id === pooledCustomerEntitlement.id,
		);
		if (isNewlyInserted) continue;

		addToExpirePoolBalanceCandidates({
			pooledBalancePlan: finalizedPlan,
			pooledCustomerEntitlement,
			expiresAt: now,
		});
	}
};

export const finalizePooledBalanceTransitionPlan = ({
	computeContext,
	now,
}: {
	computeContext: PooledBalanceComputeContext;
	now: number;
}): PooledBalancePlan | undefined => {
	const pooledBalancePlan = computeContext.plan;
	const deletedContributionBySourceEntitlementId = new Map(
		pooledBalancePlan.deletePoolContributions.map((contribution) => [
			contribution.source_customer_entitlement_id,
			contribution,
		]),
	);
	const reconciledDeletedContributionIds = new Set<string>();
	const contributionUpdatesById = new Map(
		pooledBalancePlan.updatePoolContributions.map((contribution) => [
			contribution.id,
			contribution,
		]),
	);
	const insertPoolContributions: InsertPooledBalanceContribution[] = [];

	for (const incoming of pooledBalancePlan.insertPoolContributions) {
		const current = deletedContributionBySourceEntitlementId.get(
			incoming.source_customer_entitlement_id,
		);
		if (!current || reconciledDeletedContributionIds.has(current.id)) {
			insertPoolContributions.push(incoming);
			continue;
		}

		reconciledDeletedContributionIds.add(current.id);
		if (!contributionValuesMatch({ current, incoming })) {
			contributionUpdatesById.set(
				current.id,
				toContributionUpdate({ current, incoming }),
			);
		}
	}

	const finalizedPlan: PooledBalancePlan = {
		...pooledBalancePlan,
		updatePoolBalances: pooledBalancePlan.updatePoolBalances.filter(
			(update) => update.balanceDelta !== 0 || update.grantedDelta !== 0,
		),
		insertPoolContributions,
		updatePoolContributions: Array.from(contributionUpdatesById.values()),
		deletePoolContributions: pooledBalancePlan.deletePoolContributions.filter(
			(contribution) => !reconciledDeletedContributionIds.has(contribution.id),
		),
	};

	collectExpiryCandidates({ computeContext, finalizedPlan, now });

	return pooledBalancePlanHasChanges({ pooledBalancePlan: finalizedPlan })
		? finalizedPlan
		: undefined;
};

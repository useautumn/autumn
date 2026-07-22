import type {
	DbPooledBalanceContribution,
	FullCustomerEntitlement,
	InsertPooledBalanceContribution,
	PooledBalancePlan,
} from "@autumn/shared";
import { pooledBalancePlanHasChanges } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan";

type IncomingCustomerProductContributionLinks = {
	customer_entitlements: Pick<
		FullCustomerEntitlement,
		"pooled_contribution_id"
	>[];
};

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

export const finalizePooledBalanceTransitionPlan = ({
	pooledBalancePlan,
	incomingCustomerProducts,
}: {
	pooledBalancePlan: PooledBalancePlan;
	incomingCustomerProducts: IncomingCustomerProductContributionLinks[];
}): PooledBalancePlan | undefined => {
	const deletedContributionBySourceEntitlementId = new Map(
		pooledBalancePlan.deletePoolContributions.map((contribution) => [
			contribution.source_customer_entitlement_id,
			contribution,
		]),
	);
	const reconciledDeletedContributionIds = new Set<string>();
	const preservedContributionIdByInsertedId = new Map<string, string>();
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
		preservedContributionIdByInsertedId.set(incoming.id, current.id);
		if (!contributionValuesMatch({ current, incoming })) {
			contributionUpdatesById.set(
				current.id,
				toContributionUpdate({ current, incoming }),
			);
		}
	}

	for (const customerProduct of incomingCustomerProducts) {
		for (const customerEntitlement of customerProduct.customer_entitlements) {
			const insertedContributionId = customerEntitlement.pooled_contribution_id;
			if (!insertedContributionId) continue;
			const preservedContributionId = preservedContributionIdByInsertedId.get(
				insertedContributionId,
			);
			if (preservedContributionId) {
				customerEntitlement.pooled_contribution_id = preservedContributionId;
			}
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

	return pooledBalancePlanHasChanges({ pooledBalancePlan: finalizedPlan })
		? finalizedPlan
		: undefined;
};

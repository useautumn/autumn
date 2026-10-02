import {
	type ApiBalanceV1,
	type CusProductStatus,
	type FullCusProduct,
	type FullCustomerEntitlement,
	isPooledBalanceSourceCustomerEntitlement,
} from "@autumn/shared";
import { computePooledBalanceContributionAmounts } from "../compute/applyIncomingPooledBalanceSources/computePooledBalanceContributionAmounts";

export type AttributedBalance = Pick<
	ApiBalanceV1,
	| "granted"
	| "remaining"
	| "usage"
	| "unlimited"
	| "next_reset_at"
	| "overage_allowed"
>;

export type PoolTotals = Pick<
	ApiBalanceV1,
	"granted" | "remaining" | "usage" | "unlimited" | "overage_allowed"
>;

/** What one scope feeds into one pool; `poolId` is null until billing links the source. */
export type PooledContribution = {
	poolId: string | null;
	contribution: number;
	nextResetAt: number | null;
};

/** Billing's recorded contribution, else what billing records when it links the source. */
const contributionOf = ({
	customerEntitlement,
	customerProduct,
}: {
	customerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
}) =>
	customerEntitlement.pooled_balance_contribution?.current_contribution ??
	computePooledBalanceContributionAmounts({
		contributionCustomerEntitlement: customerEntitlement,
		customerProduct,
	}).currentContribution;

const earliestResetAt = (first: number | null, second: number | null) => {
	if (first === null) return second;
	if (second === null) return first;
	return Math.min(first, second);
};

const mergeContribution = ({
	existing,
	added,
}: {
	existing: PooledContribution | undefined;
	added: PooledContribution;
}): PooledContribution => ({
	poolId: added.poolId,
	contribution: (existing?.contribution ?? 0) + added.contribution,
	nextResetAt: earliestResetAt(
		existing?.nextResetAt ?? null,
		added.nextResetAt,
	),
});

/** What the given plans pool into the customer's shared balances, per feature and pool. */
export const customerProductsToPooledContributions = ({
	customerProducts,
	inStatuses,
}: {
	customerProducts: FullCusProduct[];
	inStatuses: CusProductStatus[];
}): Record<string, PooledContribution[]> => {
	const contributions: Record<
		string,
		Map<string | null, PooledContribution>
	> = {};
	for (const customerProduct of customerProducts) {
		if (!inStatuses.includes(customerProduct.status)) continue;

		for (const customerEntitlement of customerProduct.customer_entitlements) {
			if (!isPooledBalanceSourceCustomerEntitlement({ customerEntitlement })) {
				continue;
			}
			const featureId = customerEntitlement.entitlement.feature.id;
			const byPool = contributions[featureId] ?? new Map();
			const poolId =
				customerEntitlement.pooled_balance_contribution?.pooled_balance_id ??
				null;
			byPool.set(
				poolId,
				mergeContribution({
					existing: byPool.get(poolId),
					added: {
						poolId,
						contribution: contributionOf({
							customerEntitlement,
							customerProduct,
						}),
						nextResetAt: customerEntitlement.next_reset_at ?? null,
					},
				}),
			);
			contributions[featureId] = byPool;
		}
	}
	return Object.fromEntries(
		Object.entries(contributions).map(([featureId, byPool]) => [
			featureId,
			[...byPool.values()],
		]),
	);
};

/**
 * A contributor's slice of a pool: its contribution as granted, with the pool's remaining and
 * usage split by its share of all contributions, so rollovers in the pool are shared out too.
 */
export const attributePooledBalance = ({
	own,
	contribution,
	pool,
	poolContributions,
}: {
	own: AttributedBalance | undefined;
	contribution: PooledContribution;
	pool: PoolTotals | undefined;
	poolContributions: number;
}): AttributedBalance => {
	const base = own ?? {
		granted: 0,
		remaining: 0,
		usage: 0,
		unlimited: false,
		next_reset_at: contribution.nextResetAt,
		overage_allowed: false,
	};
	const share =
		poolContributions > 0 ? contribution.contribution / poolContributions : 0;

	return {
		...base,
		granted: base.granted + contribution.contribution,
		remaining: base.remaining + (pool?.remaining ?? 0) * share,
		usage: base.usage + (pool?.usage ?? 0) * share,
		unlimited: base.unlimited || (pool?.unlimited ?? false),
		overage_allowed: base.overage_allowed || (pool?.overage_allowed ?? false),
	};
};

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

export type PoolTotals = Pick<ApiBalanceV1, "granted" | "remaining" | "usage">;

export type PooledContribution = {
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

/** What the given plans pool into the customer's shared balances, per feature. */
export const customerProductsToPooledContributions = ({
	customerProducts,
	inStatuses,
}: {
	customerProducts: FullCusProduct[];
	inStatuses: CusProductStatus[];
}): Record<string, PooledContribution> => {
	const contributions: Record<string, PooledContribution> = {};
	for (const customerProduct of customerProducts) {
		if (!inStatuses.includes(customerProduct.status)) continue;

		for (const customerEntitlement of customerProduct.customer_entitlements) {
			if (!isPooledBalanceSourceCustomerEntitlement({ customerEntitlement })) {
				continue;
			}
			const featureId = customerEntitlement.entitlement.feature.id;
			const existing = contributions[featureId];
			contributions[featureId] = {
				contribution:
					(existing?.contribution ?? 0) +
					contributionOf({ customerEntitlement, customerProduct }),
				nextResetAt: earliestResetAt(
					existing?.nextResetAt ?? null,
					customerEntitlement.next_reset_at ?? null,
				),
			};
		}
	}
	return contributions;
};

/** A contributor's slice of a pool: its contribution as granted, with the pool's remaining and usage in proportion. */
export const attributePooledBalance = ({
	own,
	contribution,
	pool,
}: {
	own: AttributedBalance | undefined;
	contribution: PooledContribution;
	pool: PoolTotals | undefined;
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
		pool && pool.granted > 0 ? contribution.contribution / pool.granted : 0;

	return {
		...base,
		granted: base.granted + contribution.contribution,
		remaining: base.remaining + (pool?.remaining ?? 0) * share,
		usage: base.usage + (pool?.usage ?? 0) * share,
	};
};

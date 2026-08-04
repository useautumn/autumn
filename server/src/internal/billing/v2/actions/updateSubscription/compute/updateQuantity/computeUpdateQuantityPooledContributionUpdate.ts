import {
	type DbPooledBalanceContribution,
	type FeatureOptions,
	type FullCusProduct,
	type FullCustomerEntitlement,
	notNullish,
} from "@autumn/shared";
import { computePooledBalanceContributionAmounts } from "@/internal/billing/v2/pooledBalances/compute/applyIncomingPooledBalanceSources/computePooledBalanceContributionAmounts";

/**
 * Deferred (next-cycle) quantity changes on a pooled prepaid contributor are
 * recorded on its contribution row and promoted at the pool's next reset.
 * Immediate quantity changes are not handled here.
 */
export const computeUpdateQuantityPooledContributionUpdate = ({
	customerEntitlement,
	customerProduct,
	updatedOptions,
	effectiveAt,
	now,
}: {
	customerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
	updatedOptions: FeatureOptions;
	effectiveAt: number;
	now: number;
}): DbPooledBalanceContribution | null => {
	const contribution = customerEntitlement.pooled_balance_contribution;
	if (!contribution) return null;

	const hasDeferredQuantityChange =
		notNullish(updatedOptions.upcoming_quantity) &&
		updatedOptions.upcoming_quantity !== updatedOptions.quantity;
	if (!hasDeferredQuantityChange) return null;

	const customerProductWithUpdatedOptions: FullCusProduct = {
		...customerProduct,
		options: customerProduct.options.map((options) =>
			options.feature_id === updatedOptions.feature_id
				? updatedOptions
				: options,
		),
	};
	const contributionAmounts = computePooledBalanceContributionAmounts({
		contributionCustomerEntitlement: customerEntitlement,
		customerProduct: customerProductWithUpdatedOptions,
	});

	return {
		...contribution,
		current_contribution: contributionAmounts.currentContribution,
		next_cycle_contribution: contributionAmounts.nextCycleContribution,
		effective_at:
			contributionAmounts.nextCycleContribution !==
			contributionAmounts.currentContribution
				? effectiveAt
				: null,
		updated_at: now,
	};
};

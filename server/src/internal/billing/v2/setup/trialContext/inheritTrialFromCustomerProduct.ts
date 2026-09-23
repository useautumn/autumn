import type { FullCusProduct, TrialContext } from "@autumn/shared";
import { isCustomerProductTrialing } from "@autumn/shared";

/**
 * Inherits trial state from an existing customer product; undefined if not trialing.
 * Lapsed revert trials still inherit so they stay Autumn-only until the expiry cron reverts them.
 */
export const inheritTrialFromCustomerProduct = ({
	customerProduct,
	currentEpochMs,
}: {
	customerProduct: FullCusProduct;
	currentEpochMs: number;
}): TrialContext | undefined => {
	const isRevertTrial = customerProduct.on_trial_end === "revert";
	const isTrialing = isCustomerProductTrialing(customerProduct, {
		nowMs: currentEpochMs,
	});
	if (!isRevertTrial && !isTrialing) return undefined;

	return {
		freeTrial: customerProduct.free_trial,
		trialEndsAt: customerProduct.trial_ends_at ?? null,
		appliesToBilling: false,
		cardRequired: true,
		onEnd: customerProduct.on_trial_end ?? undefined,
	};
};

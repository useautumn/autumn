import type { FullCusProduct, TrialContext } from "@autumn/shared";
import {
	isCustomerProductRevertingTrial,
	isCustomerProductTrialing,
} from "@autumn/shared";

export const inheritTrialFromCustomerProduct = ({
	customerProduct,
	currentEpochMs,
}: {
	customerProduct: FullCusProduct;
	currentEpochMs: number;
}): TrialContext | undefined => {
	const isRevertTrial = isCustomerProductRevertingTrial(customerProduct);
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

import type { FullCusProduct } from "@autumn/shared";

/** A no-card trial Autumn runs without Stripe (marked on_trial_end "bill") that has not been billed yet. */
export const isCustomerProductAutumnManagedTrial = (
	customerProduct?: FullCusProduct,
): boolean =>
	customerProduct?.on_trial_end === "bill" &&
	!customerProduct.subscription_ids?.length;

import { type FullCusProduct, isCustomerProductTrialing } from "@autumn/shared";

/** A no-card trial Autumn runs without Stripe (marked on_trial_end "bill"), still within its trial. */
export const isCustomerProductAutumnManagedTrial = ({
	customerProduct,
	nowMs,
}: {
	customerProduct?: FullCusProduct;
	nowMs: number;
}): boolean =>
	customerProduct?.on_trial_end === "bill" &&
	!customerProduct.subscription_ids?.length &&
	Boolean(isCustomerProductTrialing(customerProduct, { nowMs }));

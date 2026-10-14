import type { FullCusProduct } from "@autumn/shared";

export const isCustomerProductAutumnManagedTrial = (
	customerProduct?: FullCusProduct,
): boolean =>
	customerProduct?.on_trial_end === "bill" &&
	!customerProduct.subscription_ids?.length;

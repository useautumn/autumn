import {
	CusProductStatus,
	customerProductHasActiveStatus,
	type FullCusProduct,
} from "@autumn/shared";

/** Phase starts mark a plan still in its trial Trialing, which runs like an active one. */
export const runsInProjection = (customerProduct: FullCusProduct) =>
	customerProduct.status === CusProductStatus.Trialing ||
	customerProductHasActiveStatus(customerProduct);

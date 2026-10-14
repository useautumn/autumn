import {
	CusProductStatus,
	customerProductHasActiveStatus,
	type FullCusProduct,
} from "@autumn/shared";

export const runsInProjection = (customerProduct: FullCusProduct) =>
	customerProduct.status === CusProductStatus.Trialing ||
	customerProductHasActiveStatus(customerProduct);

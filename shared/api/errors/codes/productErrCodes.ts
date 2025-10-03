/**
 * Product-related error codes
 */
export const ProductErrorCode = {
	ProductNotFound: "product_not_found",
	ProductAlreadyExists: "product_already_exists",
	InvalidProductItem: "invalid_product_item",
} as const;

export type ProductErrorCode =
	(typeof ProductErrorCode)[keyof typeof ProductErrorCode];

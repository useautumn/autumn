/**
 * Price-related error codes
 */
export const PriceErrorCode = {
	PriceNotFound: "price_not_found",
	CreatePriceFailed: "create_price_failed",
	InvalidPrice: "invalid_price",
	InvalidPriceId: "invalid_price_id",
	InvalidPriceOptions: "invalid_price_options",
	InvalidPriceConfig: "invalid_price_config",
	CusPriceNotFound: "cus_price_not_found",
	GetCusPriceFailed: "get_cus_price_failed",
} as const;

export type PriceErrorCode =
	(typeof PriceErrorCode)[keyof typeof PriceErrorCode];

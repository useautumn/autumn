/**
 * Customer-related error codes
 */
export const CusErrorCode = {
	CustomerNotFound: "customer_not_found",
	CustomerAlreadyExists: "customer_already_exists",
	CustomerTaxLocationMissing: "customer_tax_location_missing",
} as const;

export type CusErrorCode = (typeof CusErrorCode)[keyof typeof CusErrorCode];

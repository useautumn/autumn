/**
 * Customer-related error codes
 */
export const CusErrorCode = {
	CustomerNotFound: "customer_not_found",
	CustomerAlreadyExists: "customer_already_exists",
} as const;

export type CusErrorCode = (typeof CusErrorCode)[keyof typeof CusErrorCode];

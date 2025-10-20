/**
 * Customer-related error codes
 */
export const CusErrorCode = {
	CustomerNotFound: "customer_not_found",
} as const;

export type CusErrorCode = (typeof CusErrorCode)[keyof typeof CusErrorCode];

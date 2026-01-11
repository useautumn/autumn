/** Error codes returned by the Lua deduction script */
export enum RedisDeductionErrorCode {
	CustomerNotFound = "CUSTOMER_NOT_FOUND",
	NoCustomerProducts = "NO_CUSTOMER_PRODUCTS",
	InsufficientBalance = "INSUFFICIENT_BALANCE",
	PaidAllocated = "PAID_ALLOCATED",
}

/** Errors that should trigger a fallback to Postgres */
export const FALLBACK_ERROR_CODES = [
	RedisDeductionErrorCode.CustomerNotFound,
	RedisDeductionErrorCode.NoCustomerProducts,
	RedisDeductionErrorCode.PaidAllocated,
] as const;

/** Error thrown by Redis deduction operations */
export class RedisDeductionError extends Error {
	code: RedisDeductionErrorCode;

	constructor({
		message,
		code,
	}: {
		message: string;
		code: RedisDeductionErrorCode;
	}) {
		super(message);
		this.name = "RedisDeductionError";
		this.code = code;
	}

	/** Check if this error should trigger a Postgres fallback */
	shouldFallback(): boolean {
		return FALLBACK_ERROR_CODES.includes(
			this.code as (typeof FALLBACK_ERROR_CODES)[number],
		);
	}
}

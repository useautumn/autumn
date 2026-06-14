/** Error codes returned by the Lua deduction script */
export enum RedisDeductionErrorCode {
	RedisUnavailable = "REDIS_UNAVAILABLE",
	CustomerNotFound = "CUSTOMER_NOT_FOUND",
	NoCustomerProducts = "NO_CUSTOMER_PRODUCTS",
	SubjectBalanceNotFound = "SUBJECT_BALANCE_NOT_FOUND",
	InsufficientBalance = "INSUFFICIENT_BALANCE",
	PaidAllocated = "PAID_ALLOCATED",
	SkipCache = "SKIP_CACHE",
	LockAlreadyExists = "LOCK_ALREADY_EXISTS",
	DuplicateIdempotencyKey = "DUPLICATE_IDEMPOTENCY_KEY",
}

/** Errors that should trigger a fallback to Postgres */
export const FALLBACK_ERROR_CODES = [
	RedisDeductionErrorCode.CustomerNotFound,
	RedisDeductionErrorCode.NoCustomerProducts,
	RedisDeductionErrorCode.SubjectBalanceNotFound,
	RedisDeductionErrorCode.PaidAllocated,
	RedisDeductionErrorCode.SkipCache,
] as const;

/** Error thrown by Redis deduction operations */
export class RedisDeductionError extends Error {
	code: RedisDeductionErrorCode;
	featureId?: string;
	/**
	 * Credit amount the rejecting feature actually attempted to deduct, in that
	 * feature's units. For a cascade this is the scaled overage amount, which
	 * differs from the body's value (the included system's full cost).
	 */
	rejectedValue?: number;

	constructor({
		message,
		code,
		featureId,
		rejectedValue,
	}: {
		message: string;
		code: RedisDeductionErrorCode;
		featureId?: string;
		rejectedValue?: number;
	}) {
		super(message);
		this.name = "RedisDeductionError";
		this.code = code;
		this.featureId = featureId;
		this.rejectedValue = rejectedValue;
	}

	isRedisUnavailable(): boolean {
		return this.code === RedisDeductionErrorCode.RedisUnavailable;
	}

	/** Check if this error should trigger a Postgres fallback */
	shouldFallback(): boolean {
		return FALLBACK_ERROR_CODES.includes(
			this.code as (typeof FALLBACK_ERROR_CODES)[number],
		);
	}
}

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
	/** False when falling back would replay an earlier successful Redis feature. */
	fallbackAllowed: boolean;

	constructor({
		message,
		code,
		featureId,
		fallbackAllowed = true,
	}: {
		message: string;
		code: RedisDeductionErrorCode;
		featureId?: string;
		fallbackAllowed?: boolean;
	}) {
		super(message);
		this.name = "RedisDeductionError";
		this.code = code;
		this.featureId = featureId;
		this.fallbackAllowed = fallbackAllowed;
	}

	isRedisUnavailable(): boolean {
		return this.code === RedisDeductionErrorCode.RedisUnavailable;
	}

	/** Check if this error should trigger a Postgres fallback */
	shouldFallback(): boolean {
		return (
			this.fallbackAllowed &&
			FALLBACK_ERROR_CODES.includes(
				this.code as (typeof FALLBACK_ERROR_CODES)[number],
			)
		);
	}
}

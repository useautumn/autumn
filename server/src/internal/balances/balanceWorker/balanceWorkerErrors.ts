import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import { PARTITION_RECOVERY_REASON } from "@autumn/balance-worker-client/protocol";
import { ErrCode, RecaseError } from "@autumn/shared";

export class BalanceWorkerUnsupportedError extends RecaseError {
	constructor({ reason }: { reason: string }) {
		const isCommandConflict = reason === "command_conflict";
		super({
			message: `Balance worker request is unsupported: ${reason}`,
			code: isCommandConflict
				? ErrCode.DuplicateIdempotencyKey
				: ErrCode.InvalidRequest,
			statusCode: isCommandConflict ? 409 : 400,
			data: { reason },
		});
	}
}

const UNAVAILABLE_CLIENT_CODES = new Set([
	"NO_OWNER",
	"ROUTE_STILL_STALE",
	"DEADLINE",
	"ABORTED",
	"TRANSPORT",
	"OWNERSHIP_UNAVAILABLE",
	"COMMAND_LOG_UNAVAILABLE",
]);

export const isBalanceWorkerUnconfirmed = (
	error: unknown,
): error is BalanceWorkerClientError =>
	error instanceof BalanceWorkerClientError &&
	(UNAVAILABLE_CLIENT_CODES.has(error.code) ||
		error.workerCode === "NOT_READY");

const STALE_SUBJECT_CODE = "balance_worker_stale_subject";
const UNAVAILABLE_CODE = "balance_worker_unavailable";
const OVERLOADED_CODE = "balance_worker_overloaded";
const RESULT_UNKNOWN_CODE = "balance_worker_result_unknown";
export type BalanceWorkerFailOpenReason =
	| typeof UNAVAILABLE_CODE
	| typeof OVERLOADED_CODE
	| typeof RESULT_UNKNOWN_CODE;

export type BalanceWorkerFailure = {
	clientCode: string;
	workerCode?: string;
	outcome: string;
	sends?: number;
	refreshes?: number;
	followedHint?: boolean;
	notReadyAnswers?: number;
	ownerlessWaits?: number;
};

function balanceWorkerFailureOf({
	cause,
}: {
	cause: BalanceWorkerClientError;
}): BalanceWorkerFailure {
	return {
		clientCode: cause.code,
		...(cause.workerCode ? { workerCode: cause.workerCode } : {}),
		outcome: cause.outcome,
		...cause.routing,
	};
}

export function describeBalanceWorkerFailure({
	error,
}: {
	error: unknown;
}): BalanceWorkerFailure | undefined {
	if (!(error instanceof RecaseError) || !FAIL_OPEN_CODES.has(error.code))
		return undefined;
	const { data } = error;
	if (typeof data !== "object" || data === null) return undefined;
	const { failure } = data as { failure?: unknown };
	if (typeof failure !== "object" || failure === null) return undefined;
	return failure as BalanceWorkerFailure;
}
const FAIL_OPEN_CODES: ReadonlySet<string> = new Set([
	UNAVAILABLE_CODE,
	OVERLOADED_CODE,
	RESULT_UNKNOWN_CODE,
]);

export const isBalanceWorkerStaleSubjectError = (error: unknown): boolean =>
	error instanceof RecaseError && error.code === STALE_SUBJECT_CODE;

export const isBalanceWorkerUnavailableError = (error: unknown): boolean =>
	error instanceof RecaseError && error.code === UNAVAILABLE_CODE;

export const balanceWorkerFailOpenReasonOf = (
	error: unknown,
): BalanceWorkerFailOpenReason | null => {
	if (!(error instanceof RecaseError)) return null;
	const { code } = error;
	return typeof code === "string" && FAIL_OPEN_CODES.has(code)
		? (code as BalanceWorkerFailOpenReason)
		: null;
};

export function rethrowBalanceWorkerError({
	cause,
}: {
	cause: unknown;
}): never {
	if (
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "NOT_INITIALIZED"
	) {
		throw new RecaseError({
			code: "balance_worker_not_initialized",
			statusCode: 409,
			message:
				"Customer must be initialized in the balance worker before check or track",
		});
	}
	if (
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "STALE_SUBJECT"
	) {
		throw new RecaseError({
			code: STALE_SUBJECT_CODE,
			statusCode: 409,
			message:
				"Customer changed while the command was decided; nothing was applied, retry",
		});
	}
	if (
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "RECORD_REFUSED"
	) {
		throw new RecaseError({
			code: "balance_worker_record_refused",
			statusCode: 500,
			message:
				"Balance worker could not store this command; nothing was applied",
		});
	}
	if (
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "CUSTOMER_NOT_FOUND"
	) {
		throw new RecaseError({
			code: ErrCode.CustomerNotFound,
			statusCode: 404,
			message: "Customer does not exist in this org and env",
		});
	}
	if (
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "ENTITY_NOT_FOUND"
	) {
		throw new RecaseError({
			code: ErrCode.EntityNotFound,
			statusCode: 404,
			message: "Entity does not exist for this customer",
		});
	}
	if (
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "UNSUPPORTED_COMMAND"
	) {
		throw new BalanceWorkerUnsupportedError({
			reason: cause.workerReason ?? "unsupported_command",
		});
	}
	if (
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "LOCK_NOT_FOUND"
	) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: "Lock not found for ID: already finalized or expired",
		});
	}
	if (
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "LOCK_ALREADY_EXISTS"
	) {
		throw new RecaseError({
			code: ErrCode.LockAlreadyExists,
			statusCode: 409,
			message: "A lock with this ID already exists",
		});
	}
	if (
		cause instanceof BalanceWorkerClientError &&
		(cause.workerCode === "COMMAND_CONFLICT" ||
			cause.workerCode === "DUPLICATE_COMMAND")
	) {
		throw new RecaseError({
			code: ErrCode.DuplicateIdempotencyKey,
			statusCode: 409,
			message:
				cause.workerCode === "DUPLICATE_COMMAND"
					? "Another request with this idempotency key has already been applied"
					: "Command id reused with a different request",
		});
	}
	if (
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "RECORD_TOO_LARGE"
	) {
		throw new RecaseError({
			code: "balance_worker_record_too_large",
			statusCode: 422,
			message:
				"This customer's balance state is too large to record; nothing was applied",
		});
	}
	if (
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "OVERLOADED"
	) {
		throw new RecaseError({
			code: OVERLOADED_CODE,
			statusCode: 429,
			message:
				"Too many concurrent requests for this customer; retry with backoff",
			data: { failure: balanceWorkerFailureOf({ cause }) },
		});
	}
	if (
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "INTERNAL" &&
		cause.workerReason === PARTITION_RECOVERY_REASON
	) {
		throw new RecaseError({
			code: RESULT_UNKNOWN_CODE,
			statusCode: 503,
			message:
				"Balance worker did not confirm the command; it may already have been applied",
			data: {
				reason: PARTITION_RECOVERY_REASON,
				failure: balanceWorkerFailureOf({ cause }),
			},
		});
	}
	if (isBalanceWorkerUnconfirmed(cause)) {
		const mayHaveApplied = cause.outcome === "unknown";
		throw new RecaseError({
			code: mayHaveApplied ? RESULT_UNKNOWN_CODE : UNAVAILABLE_CODE,
			statusCode: 503,
			message: mayHaveApplied
				? "Balance worker did not confirm the command; it may already have been applied"
				: "Balance worker is temporarily unavailable and the command was not submitted",
			data: { reason: cause.code, failure: balanceWorkerFailureOf({ cause }) },
		});
	}
	throw cause;
}

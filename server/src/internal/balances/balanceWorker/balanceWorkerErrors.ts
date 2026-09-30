import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import { ErrCode, RecaseError } from "@autumn/shared";

/** A command conflict is the caller reusing an idempotency key; everything else is a request the worker path does not serve. */
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

/** Failures the client raised on its own, before any worker returned a verdict.
 *  They say the worker path is momentarily unreachable, not that the request was
 *  wrong, so they belong in the retryable 5xx family. INVALID_RESPONSE and
 *  WORKER_ERROR are deliberately absent: those mean a worker answered with
 *  something we do not understand, which is a defect worth surfacing loudly. */
const UNAVAILABLE_CLIENT_CODES = new Set([
	"NO_OWNER",
	"ROUTE_STILL_STALE",
	"DEADLINE",
	"ABORTED",
	"TRANSPORT",
	"OWNERSHIP_UNAVAILABLE",
	"COMMAND_LOG_UNAVAILABLE",
]);

const STALE_SUBJECT_CODE = "balance_worker_stale_subject";
const UNAVAILABLE_CODE = "balance_worker_unavailable";
const OVERLOADED_CODE = "balance_worker_overloaded";
const RESULT_UNKNOWN_CODE = "balance_worker_result_unknown";
/** The worker never took the command, or never confirmed it; a fallback that is safe to repeat may answer instead. */
export type BalanceWorkerFailOpenReason =
	| typeof UNAVAILABLE_CODE
	| typeof OVERLOADED_CODE
	| typeof RESULT_UNKNOWN_CODE;

/** Which step of a worker request gave up, kept on the error so a fail-open line can say so:
 *  the client's own code (no owner, stale route, deadline...), the worker's code when one
 *  answered, and how far the request got before that. */
export type BalanceWorkerFailure = {
	clientCode: string;
	workerCode?: string;
	outcome: string;
	sends?: number;
	refreshes?: number;
	followedHint?: boolean;
	notReadyAnswers?: number;
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

/** The failure a fail-open error carries, or undefined for an error that is not one. */
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

/** The worker's copy of the customer was behind Postgres: it dropped the copy and wrote nothing. */
export const isBalanceWorkerStaleSubjectError = (error: unknown): boolean =>
	error instanceof RecaseError && error.code === STALE_SUBJECT_CODE;

/** The worker was unreachable and the command was never submitted, so answering another way loses nothing. */
export const isBalanceWorkerUnavailableError = (error: unknown): boolean =>
	error instanceof RecaseError && error.code === UNAVAILABLE_CODE;

/**
 * Why a request may fail open, or null when the worker gave a verdict. Three cases
 * qualify: the worker was unreachable, it shed the command as overloaded, or it took
 * the command and never confirmed it. The last one is only safe for a fallback that
 * cannot apply twice: a track queued under the same command ids is deduplicated by
 * the worker, and a check's fallback writes nothing.
 */
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
		// The worker rolled the decision back and dropped its copy of the customer; a retry decides on fresh rows.
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
		// The worker skipped the command for good: a defect to surface, not an outage to retry through.
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
		// Same code as the legacy path: callers branch on it, and which engine
		// served the request must not change the error they see.
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
		// Same code and status as the legacy path.
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
		// Settled or expired between the server's read and the worker's decision; same message as the legacy path.
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: "Lock not found for ID: already finalized or expired",
		});
	}
	if (
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "LOCK_ALREADY_EXISTS"
	) {
		// Same code and status as the legacy path, which callers branch on.
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
		(UNAVAILABLE_CLIENT_CODES.has(cause.code) ||
			cause.workerCode === "NOT_READY")
	) {
		// "unknown" means the command may already have been applied, so the caller
		// must reuse its idempotency key rather than retry blind.
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

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
		cause.workerCode === "UNSUPPORTED_COMMAND"
	) {
		throw new BalanceWorkerUnsupportedError({
			reason: cause.workerReason ?? "unsupported_command",
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
	throw cause;
}

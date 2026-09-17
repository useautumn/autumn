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
		throw new RecaseError({
			code: "balance_worker_customer_not_found",
			statusCode: 404,
			message: "Customer does not exist in this org and env",
		});
	}
	if (
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "COMMAND_CONFLICT"
	) {
		throw new RecaseError({
			code: ErrCode.DuplicateIdempotencyKey,
			statusCode: 409,
			message: "Command id reused with a different request",
		});
	}
	throw cause;
}

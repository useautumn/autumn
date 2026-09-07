import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import { ErrCode, RecaseError } from "@autumn/shared";

export class BalanceWorkerUnsupportedError extends RecaseError {
	constructor({ reason }: { reason: string }) {
		super({
			message: `Balance worker request is unsupported: ${reason}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
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
		cause.workerCode === "INITIALIZATION_CONFLICT"
	) {
		throw new RecaseError({
			code: "balance_worker_initialization_conflict",
			statusCode: 409,
			message: "Initialization id reused with a different baseline",
		});
	}
	throw cause;
}

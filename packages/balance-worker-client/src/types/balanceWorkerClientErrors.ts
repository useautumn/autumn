import type { WorkerErrorCode } from "../contracts/worker.js";

export type WorkerRequestOutcome = "not_submitted" | "unknown";
export type BalanceWorkerClientErrorCode =
	| "NO_OWNER"
	| "ROUTE_STILL_STALE"
	| "DEADLINE"
	| "ABORTED"
	| "TRANSPORT"
	| "INVALID_RESPONSE"
	| "OWNERSHIP_UNAVAILABLE"
	| "WORKER_ERROR";

export class BalanceWorkerClientError extends Error {
	readonly code: BalanceWorkerClientErrorCode;
	readonly outcome: WorkerRequestOutcome;
	readonly workerCode?: WorkerErrorCode;

	constructor({
		code,
		outcome,
		message,
		cause,
		workerCode,
	}: {
		code: BalanceWorkerClientErrorCode;
		outcome: WorkerRequestOutcome;
		message: string;
		cause?: unknown;
		workerCode?: WorkerErrorCode;
	}) {
		super(message, { cause });
		this.name = "BalanceWorkerClientError";
		this.code = code;
		this.outcome = outcome;
		this.workerCode = workerCode;
	}
}

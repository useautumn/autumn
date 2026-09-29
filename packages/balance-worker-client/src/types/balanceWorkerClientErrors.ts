import type { WorkerErrorCode } from "../contracts/worker.js";

export const WORKER_REQUEST_OUTCOMES = ["not_submitted", "unknown"] as const;
export type WorkerRequestOutcome = (typeof WORKER_REQUEST_OUTCOMES)[number];
export const BALANCE_WORKER_CLIENT_ERROR_CODES = [
	"NO_OWNER",
	"ROUTE_STILL_STALE",
	"DEADLINE",
	"ABORTED",
	"TRANSPORT",
	"INVALID_RESPONSE",
	"OWNERSHIP_UNAVAILABLE",
	"COMMAND_LOG_UNAVAILABLE",
	"CATALOG_INVALIDATIONS_UNAVAILABLE",
	"WORKER_ERROR",
	"PROXY_REJECTED",
] as const;
export type BalanceWorkerClientErrorCode =
	(typeof BALANCE_WORKER_CLIENT_ERROR_CODES)[number];

export class BalanceWorkerClientError extends Error {
	readonly code: BalanceWorkerClientErrorCode;
	readonly outcome: WorkerRequestOutcome;
	readonly workerCode?: WorkerErrorCode;
	/** The worker's own word for an UNSUPPORTED_COMMAND, e.g. "feature_not_found". */
	readonly workerReason?: string;

	constructor({
		code,
		outcome,
		message,
		cause,
		workerCode,
		workerReason,
	}: {
		code: BalanceWorkerClientErrorCode;
		outcome: WorkerRequestOutcome;
		message: string;
		cause?: unknown;
		workerCode?: WorkerErrorCode;
		workerReason?: string;
	}) {
		super(message, { cause });
		this.name = "BalanceWorkerClientError";
		this.code = code;
		this.outcome = outcome;
		this.workerCode = workerCode;
		this.workerReason = workerReason;
	}
}

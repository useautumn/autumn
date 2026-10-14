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

export type WorkerRequestRouting = {
	sends: number;
	refreshes: number;
	followedHint: boolean;
	notReadyAnswers: number;
	ownerlessWaits: number;
};

export class BalanceWorkerClientError extends Error {
	readonly code: BalanceWorkerClientErrorCode;
	readonly outcome: WorkerRequestOutcome;
	readonly workerCode?: WorkerErrorCode;
	readonly workerReason?: string;
	routing?: WorkerRequestRouting;

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

export function describeRequestRouting({
	error,
	routing,
}: {
	error: unknown;
	routing: WorkerRequestRouting;
}): void {
	if (!(error instanceof BalanceWorkerClientError)) return;
	error.routing ??= { ...routing };
}

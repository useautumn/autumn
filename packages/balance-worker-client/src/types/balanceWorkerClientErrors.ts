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

/** What a request did before it failed, so a fail-open line says which step gave up. */
export type WorkerRequestRouting = {
	/** Sends that reached a worker, whatever it answered. */
	sends: number;
	/** Ownership refreshes the request waited on. */
	refreshes: number;
	/** A NOT_OWNER named the successor and the request went there without a refresh. */
	followedHint: boolean;
	/** NOT_READY answers from an owner still activating, each retried at the same route. */
	notReadyAnswers: number;
};

export class BalanceWorkerClientError extends Error {
	readonly code: BalanceWorkerClientErrorCode;
	readonly outcome: WorkerRequestOutcome;
	readonly workerCode?: WorkerErrorCode;
	/** The worker's own word for an UNSUPPORTED_COMMAND, e.g. "feature_not_found". */
	readonly workerReason?: string;
	/** Set once by the send loop that raised or observed the error; absent for failures before any routing. */
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

/** Records how a request was routed on the error it ends with, once: the first send loop to see it wins. */
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

import {
	BalanceWorkerClientError,
	type BalanceWorkerClientErrorCode,
} from "@autumn/balance-worker-client";
import type { WorkerErrorCode } from "@autumn/balance-worker-client/protocol";

/** Still unsettled after the client's own NOT_OWNER retries: the same read succeeds once ownership settles. */
const UNAVAILABLE_CLIENT_CODES = new Set<BalanceWorkerClientErrorCode>([
	"NO_OWNER",
	"ROUTE_STILL_STALE",
	"OWNERSHIP_UNAVAILABLE",
	"DEADLINE",
	"TRANSPORT",
]);
const UNAVAILABLE_WORKER_CODES = new Set<WorkerErrorCode>([
	"NOT_READY",
	"OVERLOADED",
]);

/** The owning worker could not answer yet; a missing customer or a bad request is the record's own failure. */
export const isBalanceWorkerUnavailable = (cause: unknown): boolean => {
	if (!(cause instanceof BalanceWorkerClientError)) return false;
	if (UNAVAILABLE_CLIENT_CODES.has(cause.code)) return true;
	return (
		cause.workerCode !== undefined &&
		UNAVAILABLE_WORKER_CODES.has(cause.workerCode)
	);
};

import { BalanceWorkerClientError } from "@autumn/balance-worker-client";

/** The worker may have applied it: a timeout after the send. */
export const isUnknownOutcome = (cause: unknown): boolean =>
	cause instanceof BalanceWorkerClientError && cause.outcome === "unknown";

/** The worker's copy was behind Postgres; it dropped it and wrote nothing. */
export const isStaleSubject = (cause: unknown): boolean =>
	cause instanceof BalanceWorkerClientError &&
	cause.workerCode === "STALE_SUBJECT";

/** The worker already holds this command: an earlier send of it landed. */
export const isDuplicateCommand = (cause: unknown): boolean =>
	cause instanceof BalanceWorkerClientError &&
	cause.workerCode === "DUPLICATE_COMMAND";

const TRANSIENT_WORKER_CODES: ReadonlySet<string> = new Set([
	"NOT_READY",
	"OVERLOADED",
]);

export const isTransientRefusal = (cause: unknown): boolean =>
	cause instanceof BalanceWorkerClientError &&
	cause.outcome === "not_submitted" &&
	(cause.code === "NO_OWNER" ||
		TRANSIENT_WORKER_CODES.has(cause.workerCode ?? ""));

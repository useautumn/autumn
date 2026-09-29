import {
	BalanceWorkerClientError,
	type InitializeReply,
} from "@autumn/balance-worker-client";
import type {
	ReplayHydrationOutcome,
	ReplayHydrationResult,
} from "../replayHydrationContracts.js";

/** The worker had no state and could not hydrate it itself; the coordinator seeds the baseline instead. */
export function isExactInitializationMiss(cause: unknown): boolean {
	return (
		cause instanceof BalanceWorkerClientError &&
		cause.code === "WORKER_ERROR" &&
		(cause.workerCode === "NOT_INITIALIZED" ||
			cause.workerCode === "CUSTOMER_NOT_FOUND") &&
		cause.outcome === "not_submitted"
	);
}

/**
 * Only a fresh initialization proves the worker holds the baseline we sent: the
 * writer answers a duplicate with the submitted state, so later tracks may have
 * already moved actual state away from that snapshot. Duplicate and
 * already_initialized stay idempotent successes without parity evidence.
 */
export function prewarmResultOf({
	kind,
}: {
	kind: ReplayHydrationOutcome;
}): ReplayHydrationResult {
	return { kind, freshParity: kind === "initialized" };
}

/** A retry of the write is a duplicate; only the write itself proves the baseline. */
export function initializeResponseToOutcome({
	response,
}: {
	response: InitializeReply;
}): ReplayHydrationOutcome {
	const { status, duplicate } = response.result;
	if (status === "already_initialized") return "already_initialized";
	return duplicate ? "duplicate" : "initialized";
}

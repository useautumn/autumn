import type { InitializationDecision } from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import type { BalanceHydrationResult } from "../balanceHydrationContracts.js";

export function isExactInitializationMiss(cause: unknown): boolean {
	return (
		cause instanceof BalanceWorkerClientError &&
		cause.code === "WORKER_ERROR" &&
		cause.workerCode === "NOT_INITIALIZED" &&
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
	kind: InitializationDecision["kind"] | "already_ready";
}): BalanceHydrationResult {
	return { kind, freshParity: kind === "initialized" };
}

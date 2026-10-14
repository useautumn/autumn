import {
	BalanceWorkerClientError,
	type InitializeReply,
} from "@autumn/balance-worker-client";
import type {
	ReplayHydrationOutcome,
	ReplayHydrationResult,
} from "../replayHydrationContracts.js";

export function isExactInitializationMiss(cause: unknown): boolean {
	return (
		cause instanceof BalanceWorkerClientError &&
		cause.code === "WORKER_ERROR" &&
		(cause.workerCode === "NOT_INITIALIZED" ||
			cause.workerCode === "CUSTOMER_NOT_FOUND") &&
		cause.outcome === "not_submitted"
	);
}

export function prewarmResultOf({
	kind,
}: {
	kind: ReplayHydrationOutcome;
}): ReplayHydrationResult {
	return { kind, freshParity: kind === "initialized" };
}

export function initializeResponseToOutcome({
	response,
}: {
	response: InitializeReply;
}): ReplayHydrationOutcome {
	const { status, duplicate } = response.result;
	if (status === "already_initialized") return "already_initialized";
	return duplicate ? "duplicate" : "initialized";
}

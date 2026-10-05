import {
	BALANCE_WORKER_ACTIVATION_HOLD_MARGIN_MS,
	BALANCE_WORKER_ACTIVATION_HOLD_MAX_MS,
	BALANCE_WORKER_ACTIVATION_WAIT_MS,
} from "@autumn/env/balanceWorkerConstants";
import type { PartitionProcessor } from "../processor/types/partitionProcessor.js";
import { PartitionWriterRecoveryRequiredError } from "../processor/writer/writerErrors.js";
import { runWithAnswerDeadline } from "./answerDeadline.js";
import { assertRuntimeReady } from "./getRuntimeHealth.js";
import { enterRuntimeRecovery } from "./lifecycle/enterRuntimeRecovery.js";
import {
	OwnedPartitionProducerFencedError,
	RequestPastDeadlineError,
} from "./runtimeErrors.js";
import type { PartitionRuntimeScope } from "./types/partitionRuntimeState.js";

export type ProcessorRun<Decision> = (
	processor: PartitionProcessor,
) => Promise<Decision>;

/** The runtime's one gate: ready before, recovery after. Committed work still replies mid-recovery. */
export async function processCommand<Decision>({
	ctx,
	state,
	run,
	budgetMs,
	deadlineAt,
}: PartitionRuntimeScope & {
	run: ProcessorRun<Decision>;
	/** How long the caller will still wait; unset for a caller that did not say. */
	budgetMs?: number;
	/** Epoch ms the caller stops waiting; unset for a caller that did not say. */
	deadlineAt?: number;
}): Promise<Decision> {
	// Queued behind a stalled loop, the caller has already failed open: an answer now is pure cost.
	if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
		state.requestCounters.droppedPastDeadline++;
		throw new RequestPastDeadlineError();
	}
	const answerBy = answerDeadlineOf({ budgetMs });
	if (state.status === "activating")
		await waitForActivation({ ctx, state, budgetMs });
	assertRuntimeReady({ state });
	function runOnProcessor(): Promise<Decision> {
		return run(ctx.processor);
	}
	try {
		return await (answerBy === undefined
			? runOnProcessor()
			: runWithAnswerDeadline({ expiresAt: answerBy, run: runOnProcessor }));
	} catch (cause) {
		if (state.terminalError) throw state.terminalError;
		if (
			cause instanceof PartitionWriterRecoveryRequiredError ||
			cause instanceof OwnedPartitionProducerFencedError
		) {
			// Recovery withdraws this consumer batch, so the command must reject before cleanup finishes.
			void enterRuntimeRecovery({ ctx, state, cause });
			throw state.terminalError;
		}
		throw cause;
	}
}

/** A request the API resent to a freshly named owner waits for its fence and catch-up: for as
 *  long as the caller said it can wait, less a margin so the answer lands first, or a fixed
 *  moment when it did not say. Holding for the caller's budget is what lets a handoff to an
 *  idle successor cost latency rather than a fail-open. */
async function waitForActivation({
	ctx,
	state,
	budgetMs,
}: PartitionRuntimeScope & { budgetMs?: number }): Promise<void> {
	const waitMs = activationWaitMsOf({ ctx, budgetMs });
	if (waitMs <= 0) return;
	let timer: ReturnType<typeof setTimeout> | undefined;
	function scheduleTimeout(resolve: () => void): void {
		timer = setTimeout(resolve, waitMs);
	}
	async function settleStartup(): Promise<void> {
		try {
			await state.startPromise;
		} catch {
			// The gate below reports the failure as recovery.
		}
	}
	try {
		await Promise.race([settleStartup(), new Promise<void>(scheduleTimeout)]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function activationWaitMsOf({
	ctx,
	budgetMs,
}: Pick<PartitionRuntimeScope, "ctx"> & { budgetMs?: number }): number {
	if (budgetMs === undefined || !Number.isFinite(budgetMs))
		return ctx.config.activationWaitMs ?? BALANCE_WORKER_ACTIVATION_WAIT_MS;
	return Math.min(
		Math.max(budgetMs - BALANCE_WORKER_ACTIVATION_HOLD_MARGIN_MS, 0),
		BALANCE_WORKER_ACTIVATION_HOLD_MAX_MS,
	);
}

function answerDeadlineOf({
	budgetMs,
}: {
	budgetMs?: number;
}): number | undefined {
	if (budgetMs === undefined || !Number.isFinite(budgetMs)) return undefined;
	return (
		performance.now() +
		Math.max(budgetMs - BALANCE_WORKER_ACTIVATION_HOLD_MARGIN_MS, 0)
	);
}

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
import { OwnedPartitionProducerFencedError } from "./runtimeErrors.js";
import type { PartitionRuntimeScope } from "./types/partitionRuntimeState.js";

export type ProcessorRun<Decision> = (
	processor: PartitionProcessor,
) => Promise<Decision>;

export async function processCommand<Decision>({
	ctx,
	state,
	run,
	budgetMs,
}: PartitionRuntimeScope & {
	run: ProcessorRun<Decision>;
	budgetMs?: number;
}): Promise<Decision> {
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
			void enterRuntimeRecovery({ ctx, state, cause });
			throw state.terminalError;
		}
		throw cause;
	}
}

export function processInlineCommand<Decision>({
	ctx,
	state,
	run,
}: PartitionRuntimeScope & {
	run: (processor: PartitionProcessor) => Decision | null;
}): Decision | null {
	if (state.status !== "ready" || state.terminalError) return null;
	try {
		return run(ctx.processor);
	} catch (cause) {
		if (state.terminalError) throw state.terminalError;
		if (
			cause instanceof PartitionWriterRecoveryRequiredError ||
			cause instanceof OwnedPartitionProducerFencedError
		) {
			void enterRuntimeRecovery({ ctx, state, cause });
			throw state.terminalError;
		}
		throw cause;
	}
}

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

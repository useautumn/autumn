import { BALANCE_WORKER_ACTIVATION_WAIT_MS } from "@autumn/env/balanceWorkerConstants";
import type { PartitionProcessor } from "../processor/types/partitionProcessor.js";
import { PartitionWriterRecoveryRequiredError } from "../processor/writer/writerErrors.js";
import { assertRuntimeReady } from "./getRuntimeHealth.js";
import { enterRuntimeRecovery } from "./lifecycle/enterRuntimeRecovery.js";
import { OwnedPartitionProducerFencedError } from "./runtimeErrors.js";
import type { PartitionRuntimeScope } from "./types/partitionRuntimeState.js";

export type ProcessorRun<Decision> = (
	processor: PartitionProcessor,
) => Promise<Decision>;

/** The runtime's one gate: ready before, recovery after. Committed work still replies mid-recovery. */
export async function processCommand<Decision>({
	ctx,
	state,
	run,
}: PartitionRuntimeScope & {
	run: ProcessorRun<Decision>;
}): Promise<Decision> {
	if (state.status === "activating") await waitForActivation({ ctx, state });
	assertRuntimeReady({ state });
	try {
		return await run(ctx.processor);
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

/** A request the API resent to a freshly named owner waits for its fence and catch-up, briefly. */
async function waitForActivation({
	ctx,
	state,
}: PartitionRuntimeScope): Promise<void> {
	const waitMs =
		ctx.config.activationWaitMs ?? BALANCE_WORKER_ACTIVATION_WAIT_MS;
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

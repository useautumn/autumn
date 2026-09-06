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
	assertRuntimeReady({ state });
	try {
		return await run(ctx.processor);
	} catch (cause) {
		if (state.terminalError) throw state.terminalError;
		if (
			cause instanceof PartitionWriterRecoveryRequiredError ||
			cause instanceof OwnedPartitionProducerFencedError
		) {
			throw await enterRuntimeRecovery({ ctx, state, cause });
		}
		throw cause;
	}
}

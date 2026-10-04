import { createSequencerDietMode } from "../../../src/experiments/sequencerDiet.js";
import { createHashedRecentCommands } from "../../../src/processor/writer/recentCommands/createHashedRecentCommands.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { RecentCommands } from "../../../src/processor/writer/recentCommands/types/recentCommands.js";

/**
 * The bench pins the sequencer-diet arm (`SPIKE_SEQUENCER_DIET_ARM`) whatever NODE_ENV is; as in the
 * worker it is live only behind the Kafka worker thread, so a kafkajs run with B forced stays inert.
 */
export function spikeSequencerDiet({ kafkaWorker }: { kafkaWorker: boolean }): {
	recentCommands: RecentCommands;
	batchedForget: () => boolean;
} {
	const forced = process.env.SPIKE_SEQUENCER_DIET_ARM;
	const mode = createSequencerDietMode({
		serialDecide: () => ({ kafkaWorkerEnabled: kafkaWorker }),
		force: forced === "A" || forced === "B" ? forced : undefined,
	}).read();
	console.error(`SEQUENCER_DIET_ARM ${mode.arm} active=${mode.active}`);
	const window = { windowMs: 600_000, now: () => Date.now() };
	return {
		recentCommands: mode.hashedDedup
			? createHashedRecentCommands(window)
			: createRecentCommands(window),
		batchedForget: () => mode.batchedForget,
	};
}

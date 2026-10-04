import { type StagingArm, variant } from "@autumn/edge-config";
import type { SerialDecideMode } from "./serialDecide.js";

/**
 * ATMN-603: under B the critical thread's bookkeeping slims down: the partition's dedup window is the
 * typed-array store (what arm D runs already) and a committed batch is remembered in one call instead
 * of record by record. It only has a thread to help when the Kafka worker runs (serial-decide C or D);
 * under A and B of serial-decide it is inert whatever its own arm says.
 */
export const SEQUENCER_DIET_EXPERIMENT = "sequencer-diet";

export type SequencerDietMode = {
	arm: StagingArm;
	/** The arm is B and serial-decide runs the Kafka worker (C or D). */
	active: boolean;
	hashedDedup: boolean;
	batchedForget: boolean;
};

const INERT = (arm: StagingArm): SequencerDietMode => ({
	arm,
	active: false,
	hashedDedup: false,
	batchedForget: false,
});

/**
 * The dedup store is chosen when a partition is assigned, so the arm is read once, after the staging
 * variants config has loaded, and kept for the task's life; the experiment is task-scoped like serial-decide.
 */
export function createSequencerDietMode({
	serialDecide,
	force,
}: {
	serialDecide: () => Pick<SerialDecideMode, "kafkaWorkerEnabled">;
	force?: StagingArm;
}): {
	read(): SequencerDietMode;
	bootArms(): Record<string, StagingArm> | null;
} {
	let mode: SequencerDietMode | null = null;
	function read(): SequencerDietMode {
		if (mode) return mode;
		const arm = force ?? variant(SEQUENCER_DIET_EXPERIMENT);
		const active = arm === "B" && serialDecide().kafkaWorkerEnabled;
		mode = active
			? { arm, active, hashedDedup: true, batchedForget: true }
			: INERT(arm);
		return mode;
	}
	/** Labelled only where it does something, so an A task or a serial-decide A/B task carries no label. */
	function bootArms(): Record<string, StagingArm> | null {
		if (!mode?.active) return null;
		return { [SEQUENCER_DIET_EXPERIMENT]: mode.arm };
	}
	return { read, bootArms };
}

/** Dev and test only: `BALANCE_WORKER_SEQUENCER_DIET_ARM=B` turns the diet on where no staging bucket exists. */
export function forcedSequencerDietArmFromEnv(): StagingArm | undefined {
	if (process.env.NODE_ENV === "production") return undefined;
	const forced = process.env.BALANCE_WORKER_SEQUENCER_DIET_ARM;
	return forced === "A" || forced === "B" ? forced : undefined;
}

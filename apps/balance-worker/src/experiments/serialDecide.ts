import { type StagingArm, variant } from "@autumn/edge-config";

/**
 * ATMN-602: under B the worker's HTTP moves to I/O worker threads that hand request bytes to the main
 * thread over shared-memory rings; the main thread keeps every partition, writer and decision as today.
 * C adds the Kafka worker thread: the partition producers (encode, compression, sockets) leave the main
 * thread, the writer's commit loop stays. D runs C's layout too, so a four-arm config can weight it.
 */
export const SERIAL_DECIDE_EXPERIMENT = "serial-decide";

export type SerialDecideMode = {
	arm: StagingArm;
	/** True for every arm but A. */
	ioWorkersEnabled: boolean;
	/** True for C and D. */
	kafkaWorkerEnabled: boolean;
};

/**
 * A thread layout cannot change inside a window, so the arm is read once, after the staging variants
 * config has loaded, and the task keeps it for its lifetime. Outside the staging bucket `variant()` is A.
 * `force` is for tests and local runs: it is never read from the environment in production.
 */
export function createSerialDecideMode({
	force,
}: {
	force?: StagingArm;
} = {}): {
	read(): SerialDecideMode;
	bootArms(): Record<string, StagingArm> | null;
} {
	let mode: SerialDecideMode | null = null;
	function read(): SerialDecideMode {
		if (mode) return mode;
		const arm = force ?? variant(SERIAL_DECIDE_EXPERIMENT);
		mode = {
			arm,
			ioWorkersEnabled: arm !== "A",
			kafkaWorkerEnabled: arm === "C" || arm === "D",
		};
		return mode;
	}
	/** The arm this task booted with, for every health and event-loop line; null before boot and under A, so a task on today's layout (prod, dev) adds no label. */
	function bootArms(): Record<string, StagingArm> | null {
		if (!mode || mode.arm === "A") return null;
		return { [SERIAL_DECIDE_EXPERIMENT]: mode.arm };
	}
	return { read, bootArms };
}

/** Dev and test only: `BALANCE_WORKER_SERIAL_DECIDE_ARM=B` forces the layout where no staging bucket exists. */
export function forcedSerialDecideArmFromEnv(): StagingArm | undefined {
	if (process.env.NODE_ENV === "production") return undefined;
	const forced = process.env.BALANCE_WORKER_SERIAL_DECIDE_ARM;
	return forced === "A" || forced === "B" || forced === "C" || forced === "D"
		? forced
		: undefined;
}

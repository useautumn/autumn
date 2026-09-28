import type { MeteringRecordApplication } from "@autumn/kafka";
import type { JobHealth } from "../../slot/types/heraldHeartbeat.js";

/** One record of the balance log and where it sits. */
export type StreamRecord = MeteringRecordApplication;

/** One job over the balance log. Returning commits the slice's offsets; throwing leaves the slice to be read again. */
export type StreamConsumer = {
	/** Names the job's consumer group, so every job keeps a place in the log of its own. */
	name: string;
	/** One partition's records, in order. A job must make a slice it has seen before harmless. */
	handle(params: { records: StreamRecord[] }): Promise<void>;
};

export type RunningStreamConsumer = {
	start(): Promise<void>;
	stop(): Promise<void>;
	health(): JobHealth;
};

/** Thrown out of a slice herald stopped inside: nothing of it is resolved, so the next owner lands it again. */
export class HeraldStoppedMidSliceError extends Error {
	constructor() {
		super("Herald stopped before the slice landed");
		this.name = "HeraldStoppedMidSliceError";
	}
}

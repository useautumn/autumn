import type { MeteringRecordApplication } from "@autumn/kafka";
import type { JobHealth } from "../../slot/types/heraldHeartbeat.js";

/** One record of the balance log and where it sits. */
export type StreamRecord = MeteringRecordApplication;

/** Every slice of a poll lands before the next poll, so a job's polls and slices are sized together. */
export type StreamReadSize = {
	recordsPerPoll: number;
	recordsPerSlice: number;
};

/** One job over the balance log. Returning commits the slice's offsets; throwing leaves the slice to be read again. */
export type StreamConsumer = {
	/** Names the job's consumer group, so every job keeps a place in the log of its own. */
	name: string;
	/** For a job whose store lands a big slice in the same round trips as a small one; 500 a poll and a slice otherwise. */
	readSize?: StreamReadSize;
	/** One partition's records, in order. A job must make a slice it has seen before harmless. */
	handle(params: { records: StreamRecord[] }): Promise<void>;
	/** After the job leaves its group: work it holds past `handle` finishes here, before herald closes its clients. */
	stop?(): Promise<void>;
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

import type { MeteringRecordApplication } from "@autumn/kafka";
import type { JobHealth } from "../../slot/types/heraldHeartbeat.js";

export type StreamRecord = MeteringRecordApplication;

export type StreamConsumer = {
	name: string;
	handle(params: { records: StreamRecord[] }): Promise<void>;
	stop?(): Promise<void>;
};

export type RunningStreamConsumer = {
	start(): Promise<void>;
	stop(): Promise<void>;
	health(): JobHealth;
};

export class HeraldStoppedMidSliceError extends Error {
	constructor() {
		super("Herald stopped before the slice landed");
		this.name = "HeraldStoppedMidSliceError";
	}
}

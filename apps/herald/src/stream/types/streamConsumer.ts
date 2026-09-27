import type { MeteringRecordApplication } from "@autumn/kafka";

/** One record of the balance log and where it sits. */
export type StreamRecord = MeteringRecordApplication;

/** One job over the balance log. Returning commits the batch's offsets; throwing leaves the batch to be read again. */
export type StreamConsumer = {
	/** Names the job's consumer group, so every job keeps a place in the log of its own. */
	name: string;
	/** One partition's records, in order. A job must make a batch it has seen before harmless. */
	handle(params: { records: StreamRecord[] }): Promise<void>;
};

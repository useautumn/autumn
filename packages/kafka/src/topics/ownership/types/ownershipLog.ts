import type { PartitionLogRecord } from "../../../consumer/reader/types/reader.js";

export type OwnershipLogRecord = PartitionLogRecord;

export type OwnershipLog = {
	fetchHighWatermarks(): Promise<ReadonlyMap<number, bigint>>;
	readRange(params: {
		partition: number;
		fromOffset: bigint;
		toOffset: bigint;
	}): Promise<readonly OwnershipLogRecord[]>;
	disconnect?(): Promise<void>;
};

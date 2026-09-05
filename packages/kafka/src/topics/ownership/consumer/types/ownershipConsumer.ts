import type { OwnershipRecord } from "../../types/ownershipRecord.js";
import type { PartitionOwner } from "../../types/partitionOwner.js";

export type OwnershipConsumer = {
	start(): Promise<void>;
	stop(): Promise<void>;
	findOwner(params: { partition: number }): PartitionOwner | undefined;
	refresh(): Promise<void>;
};

export type OwnershipLogEntry = {
	partition: number;
	offset: bigint;
	record: OwnershipRecord;
};

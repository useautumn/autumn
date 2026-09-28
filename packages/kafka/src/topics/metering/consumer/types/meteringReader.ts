import type { PartitionReadRange } from "../../../../consumer/reader/types/reader.js";
import type { MeteringRecord } from "../../types/meteringRecord.js";

export type MeteringLogEntry = {
	partition: number;
	offset: bigint;
	record: MeteringRecord;
};

export type MeteringReader = {
	readRange(params: PartitionReadRange): Promise<readonly MeteringLogEntry[]>;
	disconnect(): Promise<void>;
};

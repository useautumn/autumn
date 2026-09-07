import { createPartitionReader } from "../../../consumer/reader/createPartitionReader.js";
import type {
	PartitionReaderConfig,
	PartitionReaderKafka,
	PartitionReadRange,
} from "../../../consumer/reader/types/reader.js";
import { parseMeteringRecord } from "../meteringTopic.js";
import type {
	MeteringLogEntry,
	MeteringReader,
} from "./types/meteringReader.js";

export function createMeteringReader({
	ctx,
	config,
}: {
	ctx: { kafka: PartitionReaderKafka };
	config: PartitionReaderConfig;
}): MeteringReader {
	const reader = createPartitionReader({ ctx, config });
	async function readRange(
		params: PartitionReadRange,
	): Promise<readonly MeteringLogEntry[]> {
		const records = await reader.readRange(params);
		const entries: MeteringLogEntry[] = [];
		for (const record of records) {
			entries.push({
				partition: record.partition,
				offset: record.offset,
				record: parseMeteringRecord(record),
			});
		}
		return entries;
	}
	const { disconnect } = reader;
	return { readRange, disconnect };
}

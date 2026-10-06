import { type MeteringRecord, parseTrustedMeteringRecord } from "@autumn/kafka";

/** Records kept for the other jobs' consumers; they read the same partitions within moments of each other. */
const SHARED_RECORDS = 20_000;

export type SharedRecordParser = (params: {
	position: { topic: string; partition: number; offset: bigint };
	key: Buffer | null;
	value: Buffer | null;
}) => MeteringRecord;

/** One parse per log record per process, shared by every job's consumer; records are read-only from here on. */
export function createSharedRecordParser(): SharedRecordParser {
	const parsed = new Map<string, MeteringRecord>();
	return ({ position, key, value }) => {
		const id = `${position.topic}:${position.partition}:${position.offset}`;
		const held = parsed.get(id);
		if (held) return held;
		const record = parseTrustedMeteringRecord({ key, value });
		parsed.set(id, record);
		if (parsed.size > SHARED_RECORDS)
			parsed.delete(parsed.keys().next().value as string);
		return record;
	};
}

import {
	meteringPartitionKeyOf,
	parseTrackOutcome,
	type TrackOutcome,
} from "@autumn/balance-engine";
import { InvalidRecordError } from "../../lib/recordErrors.js";
import {
	assertTopicRecordKey,
	readTopicEnvelope,
	serializeTopicRecord,
} from "../../lib/topicEnvelope.js";
import type {
	TopicRecordEnvelope,
	TopicSchema,
} from "../../lib/types/topicSchema.js";
import type { MeteringRecord } from "./types/meteringRecord.js";

function meteringRecordToKey({ record }: { record: MeteringRecord }): string {
	return meteringPartitionKeyOf({ identity: record.identity });
}

function parseMeteringPayload({
	type,
	payload,
}: Pick<TopicRecordEnvelope, "type" | "payload">): MeteringRecord {
	try {
		switch (type) {
			case "track_outcome":
				return parseTrackOutcome({ input: payload });
			default:
				throw new InvalidRecordError();
		}
	} catch (cause) {
		if (cause instanceof InvalidRecordError) throw cause;
		throw new InvalidRecordError({ cause });
	}
}

export function serializeMeteringRecord({
	record,
}: {
	record: MeteringRecord;
}): { key: Buffer; value: Buffer } {
	const payload = parseMeteringPayload({ type: record.type, payload: record });
	return serializeTopicRecord({
		key: meteringRecordToKey({ record: payload }),
		record: payload,
	});
}

export function parseMeteringRecord({
	key,
	value,
}: {
	key: Buffer | null;
	value: Buffer | null;
}): MeteringRecord {
	const envelope = readTopicEnvelope({ value });
	const record = parseMeteringPayload(envelope);
	assertTopicRecordKey({ key, expectedKey: meteringRecordToKey({ record }) });
	return record;
}

export const meteringTopic: TopicSchema<MeteringRecord> = {
	keyOf: meteringRecordToKey,
	parse: parseMeteringRecord,
	serialize: serializeMeteringRecord,
};

export function parseMeteringTrackOutcome({
	key,
	value,
}: {
	key: Buffer | null;
	value: Buffer | null;
}): TrackOutcome {
	const record = parseMeteringRecord({ key, value });
	if (record.type !== "track_outcome") throw new InvalidRecordError();
	return record;
}

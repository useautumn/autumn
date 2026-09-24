import {
	meteringIdentityToPartitionKey,
	parseMutationRecord,
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
	return meteringIdentityToPartitionKey({ identity: record.identity });
}

function parseMeteringPayload({
	type,
	payload,
}: Pick<TopicRecordEnvelope, "type" | "payload">): MeteringRecord {
	if (type !== "mutation") throw new InvalidRecordError();
	try {
		return parseMutationRecord({ input: payload });
	} catch (cause) {
		throw new InvalidRecordError({ cause });
	}
}

/** Each record object's encoding, kept for as long as the record itself is. */
const encodings = new WeakMap<MeteringRecord, { key: Buffer; value: Buffer }>();

/**
 * Encodes a record once per object. The writer measures a record's size when
 * it is queued and the publisher sends the same object later, so a record is
 * only validated and walked once. Records are treated as immutable from the
 * first call on.
 */
export function serializeMeteringRecord({
	record,
}: {
	record: MeteringRecord;
}): { key: Buffer; value: Buffer } {
	const cached = encodings.get(record);
	if (cached) return cached;
	parseMeteringPayload({ type: record.type, payload: record });
	const encoded = serializeTopicRecord({
		key: meteringRecordToKey({ record }),
		record,
	});
	encodings.set(record, encoded);
	return encoded;
}

export function parseMeteringRecord({
	key,
	value,
}: {
	key: Buffer | null;
	value: Buffer | null;
}): MeteringRecord {
	const envelope = readTopicEnvelope({ value });
	const record = parseMeteringPayload({
		type: envelope.type,
		payload: envelope.payload,
	});
	assertTopicRecordKey({ key, expectedKey: meteringRecordToKey({ record }) });
	return record;
}

export const meteringTopic: TopicSchema<MeteringRecord> = {
	keyOf: meteringRecordToKey,
	parse: parseMeteringRecord,
	serialize: serializeMeteringRecord,
};

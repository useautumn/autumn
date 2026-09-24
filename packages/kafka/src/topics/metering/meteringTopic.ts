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
 * it is queued and the publisher sends the same object later, so a record
 * carrying a large customer state is only walked once. Records are treated as
 * immutable from the first call on.
 *
 * The record is validated without its `after` snapshot: the engine built that
 * from state the worker already parsed, and on a customer with a large state
 * the schema walk over it held the thread for as long as the encode itself.
 * Everything else, including command offsets, is still checked. Readers
 * validate the whole record on parse.
 */
export function serializeMeteringRecord({
	record,
}: {
	record: MeteringRecord;
}): { key: Buffer; value: Buffer } {
	const cached = encodings.get(record);
	if (cached) return cached;
	const { after: _snapshot, ...checked } = record;
	parseMeteringPayload({ type: record.type, payload: checked });
	const encoded = serializeTopicRecord({
		key: meteringRecordToKey({ record }),
		record,
	});
	encodings.set(record, encoded);
	return encoded;
}

/** Whether a reader needs the record's `after` snapshot: the state as the mutation left it. */
export type MeteringSnapshotReading = "validate" | "skip";

/**
 * With `snapshot: "skip"` the record comes back without `after` and only the
 * rest is validated. The worker's own consumer applies row changes and never
 * reads the snapshot, and on a customer with a large state the schema walk
 * over it cost as much as the encode did. Readers that render the snapshot,
 * such as Herald, keep the default.
 */
export function parseMeteringRecord({
	key,
	value,
	snapshot = "validate",
}: {
	key: Buffer | null;
	value: Buffer | null;
	snapshot?: MeteringSnapshotReading;
}): MeteringRecord {
	const envelope = readTopicEnvelope({ value });
	const payload =
		snapshot === "skip" ? withoutSnapshot(envelope.payload) : envelope.payload;
	const record = parseMeteringPayload({ type: envelope.type, payload });
	assertTopicRecordKey({ key, expectedKey: meteringRecordToKey({ record }) });
	return record;
}

function withoutSnapshot(payload: unknown): unknown {
	if (typeof payload !== "object" || payload === null) return payload;
	const { after: _snapshot, ...rest } = payload as { after?: unknown };
	return rest;
}

export const meteringTopic: TopicSchema<MeteringRecord> = {
	keyOf: meteringRecordToKey,
	parse: parseMeteringRecord,
	serialize: serializeMeteringRecord,
};

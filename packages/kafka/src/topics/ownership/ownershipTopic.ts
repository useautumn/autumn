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
import {
	claimedOwnershipRecordSchema,
	type OwnershipRecord,
	unownedOwnershipRecordSchema,
} from "./types/ownershipRecord.js";

function parseClaimed({
	input,
}: {
	input: unknown;
}): Extract<OwnershipRecord, { type: "claimed" }> {
	const parsed = claimedOwnershipRecordSchema.safeParse(input);
	if (!parsed.success) throw new InvalidRecordError({ cause: parsed.error });
	return parsed.data;
}

function parseUnowned({
	input,
}: {
	input: unknown;
}): Extract<OwnershipRecord, { type: "unowned" }> {
	const parsed = unownedOwnershipRecordSchema.safeParse(input);
	if (!parsed.success) throw new InvalidRecordError({ cause: parsed.error });
	return parsed.data;
}

function ownershipRecordToKey({ record }: { record: OwnershipRecord }): string {
	return record.partition.toString();
}

function parseOwnershipPayload({
	type,
	payload,
}: Pick<TopicRecordEnvelope, "type" | "payload">): OwnershipRecord {
	switch (type) {
		case "claimed":
			return parseClaimed({ input: payload });
		case "unowned":
			return parseUnowned({ input: payload });
		default:
			throw new InvalidRecordError();
	}
}

function parseOwnershipRecord({
	key,
	value,
}: {
	key: Buffer | null;
	value: Buffer | null;
}): OwnershipRecord {
	const record = parseOwnershipPayload(readTopicEnvelope({ value }));
	assertTopicRecordKey({ key, expectedKey: ownershipRecordToKey({ record }) });
	return record;
}

function serializeOwnershipRecord({ record }: { record: OwnershipRecord }): {
	key: Buffer;
	value: Buffer;
} {
	const payload = parseOwnershipPayload({ type: record.type, payload: record });
	return serializeTopicRecord({
		key: ownershipRecordToKey({ record: payload }),
		record: payload,
	});
}

export const ownershipTopic: TopicSchema<OwnershipRecord> = {
	keyOf: ownershipRecordToKey,
	parse: parseOwnershipRecord,
	serialize: serializeOwnershipRecord,
};

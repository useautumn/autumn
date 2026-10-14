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

const encodings = new WeakMap<MeteringRecord, { key: Buffer; value: Buffer }>();

export function serializeMeteringRecord({
	record,
}: {
	record: MeteringRecord;
}): { key: Buffer; value: Buffer } {
	const cached = encodings.get(record);
	if (cached) return cached;
	if (record.type !== "mutation") throw new InvalidRecordError();
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

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMutationShaped(payload: unknown): payload is MeteringRecord {
	if (!isObject(payload) || payload.type !== "mutation") return false;
	const { identity, command, result, changes } = payload;
	return (
		isObject(identity) &&
		typeof identity.orgId === "string" &&
		typeof identity.env === "string" &&
		typeof identity.customerId === "string" &&
		isObject(command) &&
		typeof command.type === "string" &&
		typeof command.occurredAt === "number" &&
		isObject(result) &&
		Array.isArray(changes)
	);
}

export function parseTrustedMeteringRecord({
	key,
	value,
}: {
	key: Buffer | null;
	value: Buffer | null;
}): MeteringRecord {
	const envelope = readTopicEnvelope({ value });
	if (envelope.type !== "mutation" || !isMutationShaped(envelope.payload))
		throw new InvalidRecordError();
	const record = envelope.payload;
	assertTopicRecordKey({ key, expectedKey: meteringRecordToKey({ record }) });
	return record;
}

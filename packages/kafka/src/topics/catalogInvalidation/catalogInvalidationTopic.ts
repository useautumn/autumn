import { InvalidRecordError } from "../../lib/recordErrors.js";
import {
	assertTopicRecordKey,
	readTopicEnvelope,
	serializeTopicRecord,
} from "../../lib/topicEnvelope.js";
import type { TopicSchema } from "../../lib/types/topicSchema.js";
import {
	type CatalogInvalidationRecord,
	catalogInvalidationRecordSchema,
} from "./types/catalogInvalidationRecord.js";

function catalogInvalidationRecordToKey({
	record,
}: {
	record: CatalogInvalidationRecord;
}): string {
	return `${record.orgId}:${record.env}`;
}

export function serializeCatalogInvalidationRecord({
	record,
}: {
	record: CatalogInvalidationRecord;
}): { key: Buffer; value: Buffer } {
	return serializeTopicRecord({
		key: catalogInvalidationRecordToKey({ record }),
		record,
	});
}

export function parseCatalogInvalidationRecord({
	key,
	value,
}: {
	key: Buffer | null;
	value: Buffer | null;
}): CatalogInvalidationRecord {
	const envelope = readTopicEnvelope({ value });
	if (envelope.type !== "invalidated") throw new InvalidRecordError();
	const parsed = catalogInvalidationRecordSchema.safeParse(envelope.payload);
	if (!parsed.success) throw new InvalidRecordError({ cause: parsed.error });
	assertTopicRecordKey({
		key,
		expectedKey: catalogInvalidationRecordToKey({ record: parsed.data }),
	});
	return parsed.data;
}

export const catalogInvalidationTopic: TopicSchema<CatalogInvalidationRecord> =
	{
		keyOf: catalogInvalidationRecordToKey,
		parse: parseCatalogInvalidationRecord,
		serialize: serializeCatalogInvalidationRecord,
	};

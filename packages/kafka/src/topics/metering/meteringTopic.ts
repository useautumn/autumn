import {
	meteringPartitionKeyOf,
	parseCustomerStateMutation,
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
	if (type !== "mutation") throw new InvalidRecordError();
	try {
		return parseCustomerStateMutation({ input: payload });
	} catch (cause) {
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

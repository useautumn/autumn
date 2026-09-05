import {
	InvalidRecordError,
	RecordKeyMismatchError,
	UnsupportedRecordVersionError,
} from "./recordErrors.js";
import type { TopicRecordEnvelope } from "./types/topicSchema.js";

export function readTopicEnvelope({
	value,
}: {
	value: Buffer | null;
}): TopicRecordEnvelope {
	if (!value) throw new InvalidRecordError();
	let input: unknown;
	try {
		input = JSON.parse(value.toString("utf8"));
	} catch (cause) {
		throw new InvalidRecordError({ cause });
	}
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		throw new InvalidRecordError();
	}
	const envelope = input as Record<string, unknown>;
	const keys = Object.keys(envelope);
	if (keys.length !== 3) throw new InvalidRecordError();
	for (const key of keys) {
		if (key !== "schemaVersion" && key !== "type" && key !== "payload") {
			throw new InvalidRecordError();
		}
	}
	if (envelope.schemaVersion !== 1) {
		if (typeof envelope.schemaVersion === "number") {
			throw new UnsupportedRecordVersionError({
				schemaVersion: envelope.schemaVersion,
			});
		}
		throw new InvalidRecordError();
	}
	if (typeof envelope.type !== "string") throw new InvalidRecordError();
	return { schemaVersion: 1, type: envelope.type, payload: envelope.payload };
}

export function serializeTopicRecord({
	key,
	record,
}: {
	key: string;
	record: { type: string };
}): { key: Buffer; value: Buffer } {
	return {
		key: Buffer.from(key, "utf8"),
		value: Buffer.from(
			JSON.stringify({ schemaVersion: 1, type: record.type, payload: record }),
			"utf8",
		),
	};
}

export function assertTopicRecordKey({
	key,
	expectedKey,
}: {
	key: Buffer | null;
	expectedKey: string;
}): void {
	const receivedKey = key?.toString("utf8") ?? null;
	if (receivedKey !== expectedKey) {
		throw new RecordKeyMismatchError({ expectedKey, receivedKey });
	}
}

/** A producer record as send-frame parts: what is shared across its messages is written once. */
import type { ProducerRecord } from "@autumn/kafka";
import type {
	SendMessageMeta,
	SendMeta,
	SendRecord,
} from "../frames/sendFrame.js";

type ProducerRecordMessage = ProducerRecord["messages"][number];

const encoder = new TextEncoder();

function bytesOf({
	field,
}: {
	field: Buffer | string | null | undefined;
}): Uint8Array | null {
	if (field === null || field === undefined) return null;
	return typeof field === "string" ? encoder.encode(field) : field;
}

function messageMetaOf({
	message,
}: {
	message: ProducerRecordMessage;
}): SendMessageMeta {
	if (message.timestamp !== undefined)
		throw new TypeError("A threaded producer does not carry record timestamps");
	const meta: SendMessageMeta = {};
	if (message.partition !== undefined) meta.partition = message.partition;
	if (message.headers === undefined) return meta;
	for (const value of Object.values(message.headers))
		if (typeof value !== "string")
			throw new TypeError("A threaded producer carries string headers only");
	meta.headers = message.headers as Record<string, string>;
	return meta;
}

function sendMetaOf({
	producerId,
	seq,
	record,
}: {
	producerId: number;
	seq: number;
	record: ProducerRecord;
}): SendMeta {
	const first = record.messages[0];
	if (!first) throw new RangeError("Kafka batch cannot be empty");
	const meta: SendMeta = {
		producerId,
		seq,
		topic: record.topic,
		count: record.messages.length,
	};
	if (record.acks !== undefined) meta.acks = record.acks;
	const shared = record.messages.every(
		(message) =>
			message.partition === first.partition &&
			message.headers === first.headers,
	);
	if (shared) meta.shared = messageMetaOf({ message: first });
	else
		meta.messages = record.messages.map((message) =>
			messageMetaOf({ message }),
		);
	return meta;
}

export function sendFrameOf({
	producerId,
	seq,
	record,
}: {
	producerId: number;
	seq: number;
	record: ProducerRecord;
}): { meta: SendMeta; records: SendRecord[] } {
	return {
		meta: sendMetaOf({ producerId, seq, record }),
		records: record.messages.map((message) => ({
			key: bytesOf({ field: message.key }),
			value: bytesOf({ field: message.value }),
		})),
	};
}

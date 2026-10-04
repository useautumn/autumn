import { describe, expect, test } from "bun:test";
import { isKafkaProducerFencingCause } from "@autumn/kafka";
import {
	KafkaJSError,
	KafkaJSNumberOfRetriesExceeded,
	KafkaJSProtocolError,
} from "kafkajs";
import {
	decodeAckFrame,
	encodeAckFrame,
} from "../../../../src/kafka/producerThread/frames/ackFrame.js";
import {
	encodeSendMeta,
	readSendFrame,
	type SendMeta,
	sendFrameLength,
	writeSendFrame,
} from "../../../../src/kafka/producerThread/frames/sendFrame.js";
import { kafkaErrorOf } from "../../../../src/kafka/producerThread/rules/kafkaErrorOf.js";
import { producerErrorOf } from "../../../../src/kafka/producerThread/rules/producerErrorOf.js";

const encoder = new TextEncoder();

function protocolError({ type, code }: { type: string; code: number }) {
	return new KafkaJSProtocolError(
		Object.assign(new Error(`broker said ${type}`), {
			type,
			code,
			retriable: false,
		}),
	);
}

describe("producer thread frames", () => {
	test("a send frame carries its id, meta and every record's bytes, null keys and values included", () => {
		const meta: SendMeta = {
			producerId: 3,
			seq: 7,
			topic: "outcomes",
			acks: -1,
			messages: [{ partition: 4, headers: { a: "1" } }, { partition: 5 }],
			count: 2,
		};
		const records = [
			{ key: encoder.encode("customer_1"), value: encoder.encode('{"v":1}') },
			{ key: null, value: null },
		];
		const metaBytes = encodeSendMeta({ meta });
		const length = sendFrameLength({ metaBytes, records });
		const bytes = new Uint8Array(length + 3);
		writeSendFrame({ bytes, at: 3, reqId: 41, metaBytes, records });

		const frame = readSendFrame({ bytes: bytes.subarray(3) });
		expect(frame.reqId).toBe(41);
		expect(frame.meta).toEqual(meta);
		expect(
			frame.records.map(({ key, value }) => [
				key?.toString(),
				value?.toString(),
			]),
		).toEqual([
			["customer_1", '{"v":1}'],
			[undefined, undefined],
		]);
		bytes.fill(0);
		expect(frame.records[0]?.key?.toString()).toBe("customer_1");
	});

	test("an ack frame carries its id and the outcome", () => {
		const ack = {
			ok: true as const,
			metadata: [
				{ topicName: "outcomes", partition: 4, errorCode: 0, baseOffset: "12" },
			],
		};
		expect(
			decodeAckFrame({ bytes: encodeAckFrame({ reqId: 9, ack }) }),
		).toEqual({
			reqId: 9,
			ack,
		});
	});
});

describe("producer errors across threads", () => {
	test("a broker refusal comes back as a KafkaJSProtocolError, so the batch is known to be uncommitted", () => {
		const rebuilt = kafkaErrorOf({
			error: producerErrorOf({
				cause: protocolError({ type: "NOT_LEADER_FOR_PARTITION", code: 6 }),
			}),
		});
		expect(rebuilt).toBeInstanceOf(KafkaJSProtocolError);
		expect(rebuilt).toMatchObject({
			type: "NOT_LEADER_FOR_PARTITION",
			code: 6,
		});
	});

	test("anything else comes back as a KafkaJSError whose nested cause still reads as fencing", () => {
		const fenced = new KafkaJSNumberOfRetriesExceeded(
			protocolError({ type: "INVALID_PRODUCER_EPOCH", code: 47 }),
			{ retryCount: 5, retryTime: 300 },
		);
		const rebuilt = kafkaErrorOf({ error: producerErrorOf({ cause: fenced }) });
		expect(rebuilt).toBeInstanceOf(KafkaJSError);
		expect(rebuilt).not.toBeInstanceOf(KafkaJSProtocolError);
		expect(rebuilt.name).toBe("KafkaJSNumberOfRetriesExceeded");
		expect(isKafkaProducerFencingCause({ cause: rebuilt })).toBe(true);
	});

	test("a thrown non-error crosses as an unknown outcome", () => {
		const rebuilt = kafkaErrorOf({
			error: producerErrorOf({ cause: "socket closed" }),
		});
		expect(rebuilt).toBeInstanceOf(KafkaJSError);
		expect(rebuilt.message).toBe("socket closed");
	});
});

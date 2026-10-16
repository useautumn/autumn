import { describe, expect, test } from "bun:test";
import {
	hasKafkaErrorCode,
	isKafkaProducerFencingCause,
	isKafkaProtocolError,
	isRetriableKafkaError,
} from "@autumn/kafka";
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

/** What Confluent's shim throws: librdkafka's code and its verdicts on the error itself. */
function librdkafkaError({
	name = "KafkaJSProtocolError",
	message,
	code,
	retriable,
	fatal = false,
	abortable = false,
}: {
	name?: string;
	message: string;
	code: number;
	retriable: boolean;
	fatal?: boolean;
	abortable?: boolean;
}): Error {
	const error = Object.assign(new Error(message), {
		code,
		retriable,
		fatal,
		abortable,
	});
	error.name = name;
	return error;
}

function crossThreads(cause: unknown): Error {
	return kafkaErrorOf({
		error: structuredClone(producerErrorOf({ cause })),
	});
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
	test("a broker refusal keeps its code, so it still reads as that refusal and the batch as uncommitted", () => {
		const refusal = librdkafkaError({
			message:
				"Broker: Producer attempted a transactional operation in an invalid state",
			code: 51,
			retriable: true,
		});
		const rebuilt = crossThreads(refusal);
		expect(rebuilt).toBeInstanceOf(Error);
		expect(rebuilt.name).toBe("KafkaJSProtocolError");
		expect(rebuilt.message).toBe(refusal.message);
		const types = new Set(["CONCURRENT_TRANSACTIONS"]);
		expect(isKafkaProtocolError({ cause: rebuilt, types })).toBe(true);
		expect(isRetriableKafkaError(rebuilt)).toBe(true);
		expect(rebuilt).toMatchObject({ fatal: false, abortable: false });
	});

	test("a client-side failure keeps its negative code and its verdict", () => {
		const timedOut = librdkafkaError({
			name: "KafkaJSError",
			message: "Local: Message timed out",
			code: -192,
			retriable: true,
		});
		const rebuilt = crossThreads(timedOut);
		expect(isKafkaProtocolError({ cause: rebuilt })).toBe(false);
		expect(hasKafkaErrorCode({ cause: rebuilt, codes: new Set([-192]) })).toBe(
			true,
		);
		expect(isRetriableKafkaError(rebuilt)).toBe(true);
	});

	test("a wrapper with no verdict of its own lets the cause's verdict through, as it would on this thread", () => {
		const wrapped = new Error("commit failed", {
			cause: librdkafkaError({
				message: "Broker: Not leader for partition",
				code: 6,
				retriable: true,
			}),
		});
		expect(isRetriableKafkaError(wrapped)).toBe(true);
		expect(isRetriableKafkaError(crossThreads(wrapped))).toBe(true);
	});

	test("a fencing anywhere in the chain, cause, abort cause or aggregated, still reads as fencing", () => {
		const fenced = librdkafkaError({
			message: "Local: This instance has been fenced by a newer instance",
			code: -144,
			retriable: false,
			fatal: true,
		});
		for (const cause of [
			new Error("send failed", { cause: fenced }),
			Object.assign(new Error("aborted"), { abortCause: fenced }),
			new AggregateError([new Error("other"), fenced], "both failed"),
		]) {
			expect(isKafkaProducerFencingCause({ cause })).toBe(true);
			expect(isKafkaProducerFencingCause({ cause: crossThreads(cause) })).toBe(
				true,
			);
		}
	});

	test("a thrown non-error crosses as an unknown outcome", () => {
		const rebuilt = crossThreads("socket closed");
		expect(rebuilt).toBeInstanceOf(Error);
		expect(rebuilt.message).toBe("socket closed");
		expect(isKafkaProtocolError({ cause: rebuilt })).toBe(false);
		expect(isRetriableKafkaError(rebuilt)).toBe(false);
	});
});

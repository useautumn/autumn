import { expect, test } from "bun:test";
import { spanOf } from "../../src/client/librdkafka/producer/createLibrdkafkaProducer.js";
import {
	isKafkaProtocolError,
	KafkaPartialDeliveryError,
	KafkaTransactionStateUnknownError,
	sendIdempotentBatch,
} from "../../src/kafka.js";

function delivered(offset: number, partition = 0) {
	return {
		status: "fulfilled" as const,
		value: [
			{
				topicName: "t",
				partition,
				errorCode: 0,
				baseOffset: String(offset),
			},
		],
	};
}

function refused(code: number) {
	return {
		status: "rejected" as const,
		reason: Object.assign(new Error("refused"), { code }),
	};
}

const timedOut = {
	status: "rejected" as const,
	reason: Object.assign(new Error("Local: Message timed out"), { code: -192 }),
};

test("a send reports each partition's span: its lowest and highest offset", () => {
	expect(
		spanOf({
			outcomes: [delivered(12), delivered(10), delivered(11), delivered(4, 1)],
		}),
	).toEqual([
		{
			topicName: "t",
			partition: 0,
			errorCode: 0,
			baseOffset: "10",
			lastOffset: "12",
		},
		{
			topicName: "t",
			partition: 1,
			errorCode: 0,
			baseOffset: "4",
			lastOffset: "4",
		},
	]);
});

// librdkafka can split one send into record batches; a refusal of the second says nothing of the first.
test("a send only partly written is never reported as the broker's refusal", () => {
	let thrown: unknown;
	try {
		spanOf({ outcomes: [delivered(10), refused(10)] });
	} catch (cause) {
		thrown = cause;
	}
	expect(thrown).toBeInstanceOf(KafkaPartialDeliveryError);
	expect(isKafkaProtocolError({ cause: thrown })).toBe(false);
});

test("a send nothing of which was written reports a local failure before a refusal", () => {
	expect(() => spanOf({ outcomes: [refused(10), timedOut] })).toThrow(
		"Message timed out",
	);
	expect(() => spanOf({ outcomes: [refused(10), refused(10)] })).toThrow(
		"refused",
	);
});

function senderReturning(metadata: { baseOffset: string; lastOffset: string }) {
	return {
		async send() {
			return [{ topicName: "t", partition: 0, errorCode: 0, ...metadata }];
		},
	};
}

const messages = [
	{ key: Buffer.from("k"), value: Buffer.from("a") },
	{ key: Buffer.from("k"), value: Buffer.from("b") },
	{ key: Buffer.from("k"), value: Buffer.from("c") },
];

test("an idempotent batch written as one run reports its base offset", async () => {
	const result = await sendIdempotentBatch({
		sender: senderReturning({ baseOffset: "40", lastOffset: "42" }),
		topic: "t",
		partition: 0,
		messages,
	});
	expect(result).toEqual({ baseOffset: 40n });
});

// Records after the base are read as base+i; another writer's records between ours would misplace them.
test("an idempotent batch whose records were not written as one run leaves its positions unknown", async () => {
	await expect(
		sendIdempotentBatch({
			sender: senderReturning({ baseOffset: "40", lastOffset: "43" }),
			topic: "t",
			partition: 0,
			messages,
		}),
	).rejects.toBeInstanceOf(KafkaTransactionStateUnknownError);
});

test("an idempotent batch only partly written leaves its fate unknown, never not-committed", async () => {
	await expect(
		sendIdempotentBatch({
			sender: {
				async send() {
					throw new KafkaPartialDeliveryError({
						delivered: 2,
						total: 3,
						failure: Object.assign(new Error("refused"), { code: 10 }),
					});
				},
			},
			topic: "t",
			partition: 0,
			messages,
		}),
	).rejects.toBeInstanceOf(KafkaTransactionStateUnknownError);
});

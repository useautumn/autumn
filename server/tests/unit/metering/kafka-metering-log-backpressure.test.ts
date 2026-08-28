// Red: Kafka replay buffers every fetched record until the task runs out of memory.
// Green: a full buffer blocks intake until the fold drains capacity.

import { describe, expect, mock, test } from "bun:test";
import type {
	ConsumerRunConfig,
	EachMessageHandler,
	EachMessagePayload,
} from "kafkajs";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";
import { makeEvent } from "./metering-test-fixtures.js";

let eachMessage: EachMessageHandler | undefined;
const pause = mock(() => mock(() => {}));
const consumer = {
	connect: mock(async () => {}),
	subscribe: mock(async () => {}),
	run: mock(async ({ eachMessage: handler }: ConsumerRunConfig = {}) => {
		eachMessage = handler;
	}),
	seek: mock(() => {}),
	disconnect: mock(async () => {}),
};
const producer = {
	connect: mock(async () => {}),
	send: mock(async () => []),
	disconnect: mock(async () => {}),
};
const admin = {
	connect: mock(async () => {}),
	fetchTopicOffsets: mock(async () => []),
	disconnect: mock(async () => {}),
};

class FakeKafka {
	producer() {
		return producer;
	}

	consumer() {
		return consumer;
	}

	admin() {
		return admin;
	}
}

await mockModuleWithRestore("kafkajs", () => ({ Kafka: FakeKafka }));

const { KAFKA_METERING_BUFFER_CAPACITY, KafkaMeteringLog } = await import(
	"@/internal/metering/log/kafkaMeteringLog.js"
);

const messagePayload = ({
	offset,
}: {
	offset: number;
}): EachMessagePayload => ({
	topic: "metering-events",
	partition: 0,
	heartbeat: async () => {},
	pause,
	message: {
		offset: String(offset),
		key: null,
		value: Buffer.from(
			JSON.stringify(
				makeEvent({ id: `evt_${offset}`, type: "deduct", value: 1 }),
			),
		),
		timestamp: "0",
		attributes: 0,
		headers: {},
	},
});

describe("KafkaMeteringLog replay backpressure", () => {
	test("blocks Kafka intake until a full record buffer is drained", async () => {
		const log = new KafkaMeteringLog({
			brokers: ["b-1.example.amazonaws.com:9098"],
			topic: "metering-events",
			consumerGroup: "metering-worker",
		});
		await log.connect({ fromOffset: 0 });

		if (!eachMessage)
			throw new Error("Kafka eachMessage handler was not registered");
		for (let offset = 0; offset < KAFKA_METERING_BUFFER_CAPACITY; offset++) {
			await eachMessage(messagePayload({ offset }));
		}

		const waitingForCapacity = eachMessage(
			messagePayload({ offset: KAFKA_METERING_BUFFER_CAPACITY }),
		);
		await Bun.sleep(0);

		const firstBatch = await log.read({
			fromOffset: 0,
			limit: KAFKA_METERING_BUFFER_CAPACITY + 1,
		});
		expect(firstBatch).toHaveLength(KAFKA_METERING_BUFFER_CAPACITY);
		expect(pause).toHaveBeenCalledTimes(1);

		await waitingForCapacity;
		const resumedBatch = await log.read({
			fromOffset: KAFKA_METERING_BUFFER_CAPACITY,
			limit: 1,
		});
		expect(resumedBatch.map(({ offset }) => offset)).toEqual([
			KAFKA_METERING_BUFFER_CAPACITY,
		]);
		expect(pause.mock.results[0]?.value).toHaveBeenCalledTimes(1);

		await log.disconnect();
	});
});

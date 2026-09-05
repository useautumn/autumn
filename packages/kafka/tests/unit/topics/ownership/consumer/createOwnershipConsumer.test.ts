import { describe, expect, test } from "bun:test";
import type { ProducerRecord, RecordMetadata } from "kafkajs";
import type {
	KafkaProducer,
	KafkaTransaction,
} from "../../../../../src/client/types/kafkaClient.js";
import { createOwnershipConsumer } from "../../../../../src/topics/ownership/consumer/createOwnershipConsumer.js";
import { createOwnershipPublisher } from "../../../../../src/topics/ownership/publisher/createOwnershipPublisher.js";
import type {
	OwnershipLog,
	OwnershipLogRecord,
} from "../../../../../src/topics/ownership/types/ownershipLog.js";

const topic = "balance-partition-owners";
const partition = 7;

const createInMemoryOwnership = (): {
	producer: KafkaProducer;
	log: OwnershipLog;
} => {
	const records: OwnershipLogRecord[] = [];
	let nextOffset = 0n;

	const transaction: KafkaTransaction = {
		send: async (record: ProducerRecord) => {
			const baseOffset = nextOffset;
			for (const message of record.messages) {
				records.push({
					partition: message.partition ?? partition,
					offset: nextOffset,
					key: Buffer.isBuffer(message.key) ? message.key : null,
					value: Buffer.isBuffer(message.value) ? message.value : null,
				});
				nextOffset += 1n;
			}
			const metadata: RecordMetadata[] = [
				{
					topicName: record.topic,
					partition: record.messages[0]?.partition ?? partition,
					errorCode: 0,
					baseOffset: baseOffset.toString(),
				},
			];
			return metadata;
		},
		commit: async () => undefined,
		abort: async () => undefined,
	};

	return {
		producer: {
			transaction: async () => transaction,
		},
		log: {
			fetchHighWatermarks: async () => new Map([[partition, nextOffset]]),
			readRange: async ({
				partition: requestedPartition,
				fromOffset,
				toOffset,
			}) =>
				records.filter(
					(record) =>
						record.partition === requestedPartition &&
						record.offset >= fromOffset &&
						record.offset < toOffset,
				),
		},
	};
};

describe("createOwnershipConsumer", () => {
	test("replays claims and releases from the producer", async () => {
		const { producer, log } = createInMemoryOwnership();
		const ownershipPublisher = createOwnershipPublisher({
			ctx: { producer },
			config: { topic },
		});
		const consumer = createOwnershipConsumer({ ctx: { log } });

		const first = await ownershipPublisher.claim({
			partition,
			endpoint: "http://10.0.0.4:8080",
			claimedAt: 1,
		});
		await consumer.start();
		expect(consumer.findOwner({ partition })).toEqual({
			partition,
			endpoint: "http://10.0.0.4:8080",
			routeEpoch: first.routeEpoch,
		});

		const second = await ownershipPublisher.claim({
			partition,
			endpoint: "http://10.0.0.8:8080",
			claimedAt: 2,
		});
		await consumer.refresh();
		expect(consumer.findOwner({ partition })).toEqual({
			partition,
			endpoint: "http://10.0.0.8:8080",
			routeEpoch: second.routeEpoch,
		});
		expect(BigInt(second.routeEpoch)).toBeGreaterThan(BigInt(first.routeEpoch));

		await ownershipPublisher.release({ partition, releasedAt: 3 });
		await consumer.refresh();
		expect(consumer.findOwner({ partition })).toBeUndefined();
		await consumer.stop();
	});

	test("refuses lookups before start", () => {
		const { log } = createInMemoryOwnership();
		const consumer = createOwnershipConsumer({ ctx: { log } });

		expect(() => consumer.findOwner({ partition })).toThrow("created");
	});
});

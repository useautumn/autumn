import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { meteringPartitionKeyOf } from "@autumn/balance-engine";
import type { ProducerRecord, RecordMetadata } from "kafkajs";
import type {
	KafkaProducer,
	KafkaTransaction,
} from "../../src/client/types/kafkaClient.js";
import {
	InvalidRecordError,
	RecordKeyMismatchError,
} from "../../src/lib/recordErrors.js";
import { meteringIdentityToPartition } from "../../src/partitioning/meteringIdentityToPartition.js";
import { createOwnershipConsumer } from "../../src/topics/ownership/consumer/createOwnershipConsumer.js";
import { applyOwnershipRecord } from "../../src/topics/ownership/consumer/ownershipReplay.js";
import { ownershipTopic } from "../../src/topics/ownership/ownershipTopic.js";
import { createOwnershipPublisher } from "../../src/topics/ownership/publisher/createOwnershipPublisher.js";
import type {
	OwnershipLog,
	OwnershipLogRecord,
} from "../../src/topics/ownership/types/ownershipLog.js";

describe("ownershipRecords", function ownershipRecordsTests() {
	const claimed = {
		schemaVersion: 1 as const,
		type: "claimed" as const,
		partition: 7,
		endpoint: "http://10.0.0.4:8080",
		claimedAt: 1_700_000_000_000,
	};

	describe("ownershipTopic", () => {
		test("round-trips a claim keyed by partition", () => {
			const serialized = ownershipTopic.serialize({ record: claimed });

			expect(serialized.key.toString("utf8")).toBe("7");
			expect(ownershipTopic.parse(serialized)).toEqual(claimed);
		});

		test("round-trips an unowned record", () => {
			const record = {
				schemaVersion: 1 as const,
				type: "unowned" as const,
				partition: 7,
				releasedAt: 1_700_000_000_100,
			};
			const serialized = ownershipTopic.serialize({ record });

			expect(ownershipTopic.parse(serialized)).toEqual(record);
		});

		test("rejects a record whose Kafka key names another partition", () => {
			const serialized = ownershipTopic.serialize({ record: claimed });

			expect(() =>
				ownershipTopic.parse({
					key: Buffer.from("3", "utf8"),
					value: serialized.value,
				}),
			).toThrow(RecordKeyMismatchError);
		});
	});

	function preservesOwnershipWireBytes(): void {
		const serialized = ownershipTopic.serialize({ record: claimed });
		expect(serialized).toEqual({
			key: Buffer.from("7", "utf8"),
			value: Buffer.from(
				JSON.stringify({ schemaVersion: 1, type: "claimed", payload: claimed }),
				"utf8",
			),
		});
		const envelope = JSON.parse(serialized.value.toString("utf8"));
		for (const invalid of [
			{ ...envelope, type: "unknown_record" },
			{ ...envelope, type: "unowned" },
			{ ...envelope, payload: { ...claimed, extra: true } },
		]) {
			function parse(): void {
				ownershipTopic.parse({
					key: serialized.key,
					value: Buffer.from(JSON.stringify(invalid)),
				});
			}
			expect(parse).toThrow(InvalidRecordError);
		}
		let failure: unknown;
		try {
			ownershipTopic.parse({
				key: serialized.key,
				value: Buffer.from(JSON.stringify({ ...envelope, payload: {} })),
			});
		} catch (cause) {
			failure = cause;
		}
		expect(failure).toBeInstanceOf(InvalidRecordError);
		expect((failure as Error).cause).toBeInstanceOf(Error);
	}

	test(
		"preserves ownership wire bytes and strict payload validation",
		preservesOwnershipWireBytes,
	);
});

describe("ownershipPublication", function ownershipPublicationTests() {
	const topic = "balance-partition-owners";

	const partition = 4;

	function createFakeProducer({
		metadata = [
			{
				topicName: topic,
				partition,
				errorCode: 0,
				baseOffset: "11",
			},
		],
	}: {
		metadata?: RecordMetadata[];
	} = {}): {
		producer: KafkaProducer;
		records: ProducerRecord[];
	} {
		const records: ProducerRecord[] = [];
		async function send(record: ProducerRecord): Promise<RecordMetadata[]> {
			records.push(record);
			return metadata;
		}
		async function commit(): Promise<void> {}
		async function abort(): Promise<void> {}
		async function transaction(): Promise<KafkaTransaction> {
			return { send, commit, abort };
		}

		return {
			producer: { transaction },
			records,
		};
	}

	async function publishesClaimAndReturnsEpoch(): Promise<void> {
		const fake = createFakeProducer();
		const producer = createOwnershipPublisher({
			ctx: { producer: fake.producer },
			config: { topic },
		});

		await expect(
			producer.claim({
				partition,
				endpoint: "http://10.0.0.4:8080",
				claimedAt: 1_700_000_000_000,
			}),
		).resolves.toEqual({ routeEpoch: "11" });

		expect(fake.records[0]).toMatchObject({ topic, acks: -1 });
		expect(
			ownershipTopic.parse({
				key: Buffer.isBuffer(fake.records[0]?.messages[0]?.key)
					? fake.records[0].messages[0].key
					: null,
				value: Buffer.isBuffer(fake.records[0]?.messages[0]?.value)
					? fake.records[0].messages[0].value
					: null,
			}),
		).toEqual({
			schemaVersion: 1,
			type: "claimed",
			partition,
			endpoint: "http://10.0.0.4:8080",
			claimedAt: 1_700_000_000_000,
		});
	}

	async function publishesRelease(): Promise<void> {
		const fake = createFakeProducer({
			metadata: [
				{
					topicName: topic,
					partition,
					errorCode: 0,
					baseOffset: "12",
				},
			],
		});
		const producer = createOwnershipPublisher({
			ctx: { producer: fake.producer },
			config: { topic },
		});

		await expect(
			producer.release({ partition, releasedAt: 1_700_000_000_100 }),
		).resolves.toEqual({ routeEpoch: "12" });
		expect(
			ownershipTopic.parse({
				key: Buffer.isBuffer(fake.records[0]?.messages[0]?.key)
					? fake.records[0].messages[0].key
					: null,
				value: Buffer.isBuffer(fake.records[0]?.messages[0]?.value)
					? fake.records[0].messages[0].value
					: null,
			}).type,
		).toBe("unowned");
	}

	test(
		"claims with a transactional write and returns the offset epoch",
		publishesClaimAndReturnsEpoch,
	);

	test("releases with an unowned record", publishesRelease);
});

describe("ownershipConsumption", function ownershipConsumptionTests() {
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
			expect(BigInt(second.routeEpoch)).toBeGreaterThan(
				BigInt(first.routeEpoch),
			);

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
});

describe("ownershipReplay", function ownershipReplayTests() {
	const claimed = {
		schemaVersion: 1 as const,
		type: "claimed" as const,
		partition: 7,
		endpoint: "http://10.0.0.4:8080",
		claimedAt: 1_700_000_000_000,
	};

	const unowned = {
		schemaVersion: 1 as const,
		type: "unowned" as const,
		partition: 7,
		releasedAt: 1_700_000_000_100,
	};

	describe("applyOwnershipRecord", () => {
		test("records a claim", () => {
			const owners = applyOwnershipRecord({
				owners: new Map(),
				record: claimed,
				offset: 3n,
			});

			expect(owners.get(7)).toEqual({
				partition: 7,
				endpoint: "http://10.0.0.4:8080",
				routeEpoch: "3",
			});
		});

		test("forgets a partition on unowned", () => {
			const claimedOwners = applyOwnershipRecord({
				owners: new Map(),
				record: claimed,
				offset: 3n,
			});

			expect(
				applyOwnershipRecord({
					owners: claimedOwners,
					record: unowned,
					offset: 4n,
				}).get(7),
			).toBeUndefined();
		});

		test("keeps the higher offset when two claims race", () => {
			const first = applyOwnershipRecord({
				owners: new Map(),
				record: claimed,
				offset: 3n,
			});
			const second = applyOwnershipRecord({
				owners: first,
				record: { ...claimed, endpoint: "http://10.0.0.8:8080" },
				offset: 9n,
			});

			expect(second.get(7)?.endpoint).toBe("http://10.0.0.8:8080");
			expect(second.get(7)?.routeEpoch).toBe("9");
		});

		test("ignores a stale claim or release", () => {
			const current = applyOwnershipRecord({
				owners: new Map(),
				record: claimed,
				offset: 9n,
			});

			expect(
				applyOwnershipRecord({
					owners: current,
					record: { ...claimed, endpoint: "http://stale:8080" },
					offset: 3n,
				}).get(7)?.endpoint,
			).toBe("http://10.0.0.4:8080");
			expect(
				applyOwnershipRecord({
					owners: current,
					record: unowned,
					offset: 3n,
				}).get(7)?.routeEpoch,
			).toBe("9");
		});
	});
});

describe("partitionRouting", function partitionRoutingTests() {
	const require = createRequire(import.meta.url);

	const murmur2 =
		require("kafkajs/src/producer/partitioners/default/murmur2.js") as (
			key: Buffer,
		) => number;

	const identity = {
		orgId: "org_1",
		env: "sandbox",
		customerId: "cus_1",
	} as const;

	function matchesKafkaDefaultPartitioner(): void {
		const key = Buffer.from(meteringPartitionKeyOf({ identity }), "utf8");
		const kafkaPartition = (murmur2(key) & 0x7fffffff) % 32;

		expect(meteringIdentityToPartition({ identity, partitionCount: 32 })).toBe(
			kafkaPartition,
		);
	}

	function keepsStablePartition(): void {
		expect(meteringIdentityToPartition({ identity, partitionCount: 16 })).toBe(
			meteringIdentityToPartition({ identity, partitionCount: 16 }),
		);
	}

	function rejectsInvalidPartitionCount(): void {
		function resolveInvalidPartition(): void {
			meteringIdentityToPartition({ identity, partitionCount: 0 });
		}
		expect(resolveInvalidPartition).toThrow("partitionCount");
	}

	test(
		"matches KafkaJS DefaultPartitioner for the customer key",
		matchesKafkaDefaultPartitioner,
	);

	test("is stable for the same identity and count", keepsStablePartition);

	test("rejects an invalid partition count", rejectsInvalidPartitionCount);
});

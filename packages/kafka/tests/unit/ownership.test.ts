import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { meteringPartitionKeyOf } from "@autumn/balance-engine";
import type {
	ConsumerConfig,
	ConsumerRunConfig,
	ProducerRecord,
	RecordMetadata,
} from "kafkajs";
import type {
	KafkaProducer,
	KafkaTransaction,
} from "../../src/client/types/kafkaClient.js";
import type { KafkaConsumerClient } from "../../src/consumer/types/consumer.js";
import {
	InvalidRecordError,
	RecordKeyMismatchError,
} from "../../src/lib/recordErrors.js";
import { meteringIdentityToPartition } from "../../src/partitioning/meteringIdentityToPartition.js";
import { createOwnershipConsumer } from "../../src/topics/ownership/consumer/createOwnershipConsumer.js";
import {
	applyOwnershipMessage,
	applyOwnershipRecord,
} from "../../src/topics/ownership/consumer/ownershipReplay.js";
import type { OwnershipConsumerState } from "../../src/topics/ownership/consumer/types/ownershipConsumer.js";
import { ownershipTopic } from "../../src/topics/ownership/ownershipTopic.js";
import { createOwnershipPublisher } from "../../src/topics/ownership/publisher/createOwnershipPublisher.js";
import type { OwnershipLogRecord } from "../../src/topics/ownership/types/ownershipLog.js";

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

	function createInMemoryOwnership() {
		const records: OwnershipLogRecord[] = [];
		const listeners = new Map<string, Set<(event: unknown) => void>>();
		let nextOffset = 0n;
		let cursor = 0;
		let running = false;
		let runConfig: ConsumerRunConfig | undefined;
		let offsetReads = 0;
		let disconnects = 0;
		let groupConfig: ConsumerConfig | undefined;

		async function connect(): Promise<void> {}
		async function subscribe(): Promise<void> {}
		async function stop(): Promise<void> {
			running = false;
		}
		async function disconnect(): Promise<void> {
			disconnects++;
			running = false;
		}
		async function commitOffsets(): Promise<void> {}
		function seek(): void {}
		function pause(): void {}
		function resume(): void {}
		function on(event: string, listener: (event: unknown) => void): () => void {
			const pending = listeners.get(event) ?? new Set();
			pending.add(listener);
			listeners.set(event, pending);
			function remove(): void {
				pending.delete(listener);
			}
			return remove;
		}
		function emit({
			event,
			payload,
		}: {
			event: string;
			payload: unknown;
		}): void {
			for (const listener of listeners.get(event) ?? []) listener({ payload });
		}
		async function deliver(): Promise<void> {
			while (running && cursor < records.length) {
				const record = records[cursor];
				let resolved = false;
				function resolveOffset(): void {
					resolved = true;
				}
				async function heartbeat(): Promise<void> {}
				function isRunning(): boolean {
					return running;
				}
				function isStale(): boolean {
					return false;
				}
				function firstOffset(): string {
					return record.offset.toString();
				}
				function lastOffset(): string {
					return record.offset.toString();
				}
				function isEmpty(): boolean {
					return false;
				}
				function offsetLag(): string {
					return "0";
				}
				function uncommittedOffsets() {
					return {
						topics: [
							{
								topic,
								partitions: [
									{ partition, offset: (record.offset + 1n).toString() },
								],
							},
						],
					};
				}
				function pauseBatch(): () => void {
					return resume;
				}
				if (!runConfig?.eachBatch) throw new Error("Missing batch handler");
				await runConfig.eachBatch({
					batch: {
						topic,
						partition,
						highWatermark: nextOffset.toString(),
						messages: [
							{
								...record,
								offset: record.offset.toString(),
								timestamp: "0",
								attributes: 0,
								headers: {},
							},
						],
						firstOffset,
						lastOffset,
						isEmpty,
						offsetLag,
						offsetLagLow: offsetLag,
					},
					resolveOffset,
					heartbeat,
					pause: pauseBatch,
					uncommittedOffsets,
					commitOffsetsIfNecessary: commitOffsets,
					isRunning,
					isStale,
				});
				if (resolved) cursor++;
			}
		}
		async function run(config: ConsumerRunConfig = {}): Promise<void> {
			runConfig = config;
			running = true;
			await deliver();
		}
		const consumerClient = {
			connect,
			subscribe,
			run,
			stop,
			disconnect,
			commitOffsets,
			seek,
			pause,
			resume,
			on: on as KafkaConsumerClient["on"],
			events: {
				GROUP_JOIN: "join",
				END_BATCH_PROCESS: "batch",
				CRASH: "crash",
			} as unknown as KafkaConsumerClient["events"],
		};
		function consumer(config: ConsumerConfig) {
			groupConfig = config;
			return consumerClient;
		}
		async function fetchTopicOffsets() {
			offsetReads++;
			return [
				{
					partition,
					offset: nextOffset.toString(),
					low: "0",
					high: nextOffset.toString(),
				},
			];
		}
		function admin() {
			return { connect, disconnect, fetchTopicOffsets };
		}
		const kafka = { consumer, admin };
		async function send(record: ProducerRecord): Promise<RecordMetadata[]> {
			const baseOffset = nextOffset;
			for (const message of record.messages) {
				records.push({
					partition: message.partition ?? partition,
					offset: nextOffset++,
					key: Buffer.isBuffer(message.key) ? message.key : null,
					value: Buffer.isBuffer(message.value) ? message.value : null,
				});
			}
			return [
				{
					topicName: record.topic,
					partition,
					errorCode: 0,
					baseOffset: baseOffset.toString(),
				},
			];
		}
		async function commit(): Promise<void> {
			await deliver();
		}
		async function abort(): Promise<void> {}
		async function transaction(): Promise<KafkaTransaction> {
			return { send, commit, abort };
		}
		function readStats() {
			return { offsetReads, disconnects, groupConfig };
		}
		function raiseTarget(): void {
			nextOffset++;
		}
		function consumeFilteredOffset(): void {
			emit({
				event: "batch",
				payload: {
					topic,
					partition,
					highWatermark: nextOffset.toString(),
					lastOffset: (nextOffset - 1n).toString(),
					batchSize: 0,
				},
			});
		}
		function rejoin(): void {
			emit({ event: "join", payload: {} });
		}
		function crash(): void {
			emit({
				event: "crash",
				payload: { error: new Error("Consumer crashed") },
			});
		}
		return {
			producer: { transaction },
			kafka,
			readStats,
			raiseTarget,
			consumeFilteredOffset,
			rejoin,
			crash,
		};
	}
	function preservesReleaseOrdering(): void {
		const state: OwnershipConsumerState = {
			status: "started",
			owners: new Map(),
			lastAppliedOffsets: new Map(),
			lifetime: new AbortController(),
		};
		const claim = ownershipTopic.serialize({
			record: {
				schemaVersion: 1,
				type: "claimed",
				partition,
				endpoint: "http://worker:8080",
				claimedAt: 1,
			},
		});
		const release = ownershipTopic.serialize({
			record: { schemaVersion: 1, type: "unowned", partition, releasedAt: 2 },
		});
		applyOwnershipMessage({ state, message: claim, partition, offset: 1n });
		applyOwnershipMessage({ state, message: release, partition, offset: 2n });
		applyOwnershipMessage({ state, message: claim, partition, offset: 1n });
		expect(state.owners.has(partition)).toBe(false);
		expect(state.lastAppliedOffsets.get(partition)).toBe(2n);
		function applyWrongPartition(): void {
			applyOwnershipMessage({
				state,
				message: claim,
				partition: 0,
				offset: 3n,
			});
		}
		expect(applyWrongPartition).toThrow("Kafka partition");
		expect(state.owners.size).toBe(0);
		applyOwnershipMessage({ state, message: claim, partition, offset: 3n });
		expect(state.owners.get(partition)?.routeEpoch).toBe("3");
	}

	async function followsWithoutRefreshing(): Promise<void> {
		const fixture = createInMemoryOwnership();
		const consumer = createOwnershipConsumer({
			ctx: { kafka: fixture.kafka },
			config: { topic },
		});
		const publisher = createOwnershipPublisher({
			ctx: { producer: fixture.producer },
			config: { topic },
		});
		try {
			await consumer.start();
			const reads = fixture.readStats().offsetReads;
			const claim = await publisher.claim({
				partition,
				endpoint: "http://worker:8080",
				claimedAt: 1,
			});
			expect(consumer.findOwner({ partition })?.routeEpoch).toBe(
				claim.routeEpoch,
			);
			fixture.rejoin();
			await publisher.release({ partition, releasedAt: 2 });
			expect(consumer.findOwner({ partition })).toBeUndefined();
			expect(fixture.readStats().offsetReads).toBe(reads);
			expect(fixture.readStats().groupConfig).toMatchObject({
				readUncommitted: false,
				allowAutoTopicCreation: false,
			});
		} finally {
			await consumer.stop();
		}
	}

	async function coalescesRefreshAndTracksFilteredOffsets(): Promise<void> {
		const fixture = createInMemoryOwnership();
		const consumer = createOwnershipConsumer({
			ctx: { kafka: fixture.kafka },
			config: { topic },
		});
		try {
			await consumer.start();
			fixture.raiseTarget();
			const first = consumer.refresh();
			expect(consumer.refresh()).toBe(first);
			fixture.consumeFilteredOffset();
			await first;
			expect(fixture.readStats().offsetReads).toBe(2);
			expect(consumer.findOwner({ partition })).toBeUndefined();
		} finally {
			await consumer.stop();
		}
	}

	async function interruptsRefreshOnStop(): Promise<void> {
		const fixture = createInMemoryOwnership();
		const consumer = createOwnershipConsumer({
			ctx: { kafka: fixture.kafka },
			config: { topic },
		});
		await consumer.start();
		fixture.raiseTarget();
		const refresh = Promise.allSettled([consumer.refresh()]);
		await consumer.stop();
		expect((await refresh)[0].status).toBe("rejected");
		function findOwner(): void {
			consumer.findOwner({ partition });
		}
		expect(findOwner).toThrow("stopped");
		fixture.consumeFilteredOffset();
		expect(findOwner).toThrow("stopped");
		expect(fixture.readStats().disconnects).toBeGreaterThanOrEqual(2);
	}

	async function boundsCatchUpAndRecoversRefresh(): Promise<void> {
		const fixture = createInMemoryOwnership();
		const consumer = createOwnershipConsumer({
			ctx: { kafka: fixture.kafka },
			config: { topic, catchUpTimeoutMs: 10 },
		});
		try {
			await consumer.start();
			fixture.raiseTarget();
			await expect(consumer.refresh()).rejects.toThrow("deadline");
			fixture.consumeFilteredOffset();
			await consumer.refresh();
			expect(consumer.findOwner({ partition })).toBeUndefined();
		} finally {
			await consumer.stop();
		}
	}

	async function cancelsStartupAndFailsClosed(): Promise<void> {
		const fixture = createInMemoryOwnership();
		const consumer = createOwnershipConsumer({
			ctx: { kafka: fixture.kafka },
			config: { topic },
		});
		fixture.raiseTarget();
		const started = Promise.allSettled([consumer.start()]);
		await consumer.stop();
		expect((await started)[0].status).toBe("rejected");
		function findStopped(): void {
			consumer.findOwner({ partition });
		}
		expect(findStopped).toThrow("stopped");
		const next = createInMemoryOwnership();
		const crashed = createOwnershipConsumer({
			ctx: { kafka: next.kafka },
			config: { topic },
		});
		await crashed.start();
		next.crash();
		function findFailed(): void {
			crashed.findOwner({ partition });
		}
		expect(findFailed).toThrow("failed");
		await crashed.stop();
	}

	test(
		"replayed claims cannot resurrect a released owner",
		preservesReleaseOrdering,
	);
	test(
		"follows claims/releases and resumes after a rejoin without explicit refresh",
		followsWithoutRefreshing,
	);
	test(
		"coalesces refresh and counts control-only progress",
		coalescesRefreshAndTracksFilteredOffsets,
	);
	test(
		"shutdown interrupts refresh and forbids later lookups",
		interruptsRefreshOnStop,
	);
	test(
		"refresh has a bounded deadline and can be attempted again",
		boundsCatchUpAndRecoversRefresh,
	);
	test(
		"startup cancellation and terminal crashes fail closed",
		cancelsStartupAndFailsClosed,
	);

	describe("createOwnershipConsumer", () => {
		test("replays claims and releases from the producer", async () => {
			const { producer, kafka } = createInMemoryOwnership();
			const ownershipPublisher = createOwnershipPublisher({
				ctx: { producer },
				config: { topic },
			});
			const consumer = createOwnershipConsumer({
				ctx: { kafka },
				config: { topic },
			});

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
			const { kafka } = createInMemoryOwnership();
			const consumer = createOwnershipConsumer({
				ctx: { kafka },
				config: { topic },
			});

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

import { expect, test } from "bun:test";
import {
	computeTrack,
	createSubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import { serializeMeteringRecord } from "@autumn/kafka";
import type {
	ConsumerCrashEvent,
	ConsumerRunConfig,
	EachBatchPayload,
	Kafka,
	KafkaMessage,
} from "kafkajs";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createStreamConsumer } from "../../../src/stream/createStreamConsumer.js";
import type {
	StreamConsumer,
	StreamRecord,
} from "../../../src/stream/types/streamConsumer.js";

const topic = "local-events";
const partition = 0;

const trackMessage = ({ offset }: { offset: string }) => {
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
	});
	const mutation = computeTrack({
		fullSubject: subjectStateToFullSubject({
			state,
			catalog: createCatalogFor({ state }),
		}),
		command: createTrackCommand({ value: 3 }),
	});
	const record = { ...mutation, receipt: { fingerprint: "f", expiresAt: 1 } };
	return { offset, ...serializeMeteringRecord({ record }) };
};

const badMessage = ({ offset }: { offset: string }) => ({
	offset,
	key: Buffer.from("bad"),
	value: Buffer.from("{"),
});

type Delivered = { offset: string; key: Buffer | null; value: Buffer | null };

/**
 * The slice of kafkajs herald touches, over the real package consumer: run config captured, resolves,
 * heartbeats and commits recorded, and the group events reachable so a crash can be staged.
 */
const createFakeKafka = ({
	heartbeatFailsAfter,
	committed = {},
}: {
	heartbeatFailsAfter?: number;
	committed?: Record<number, string>;
} = {}) => {
	const events: string[] = [];
	const listeners = new Map<string, (event: unknown) => void>();
	let runConfig: ConsumerRunConfig | undefined;
	let running = false;
	let heartbeats = 0;
	const consumer = {
		events: {
			CRASH: "consumer.crash",
			GROUP_JOIN: "consumer.group_join",
			REBALANCING: "consumer.rebalancing",
			END_BATCH_PROCESS: "consumer.end_batch_process",
		},
		on: (event: string, listener: (event: unknown) => void) => {
			listeners.set(event, listener);
			return () => listeners.delete(event);
		},
		connect: async () => {
			events.push("connect");
		},
		subscribe: async ({ fromBeginning }: { fromBeginning: boolean }) => {
			events.push(`subscribe:fromBeginning=${fromBeginning}`);
		},
		run: async (config: ConsumerRunConfig) => {
			events.push(`run:autoCommit=${config.autoCommit}`);
			runConfig = config;
			running = true;
		},
		stop: async () => {
			running = false;
			events.push("stop");
		},
		disconnect: async () => {
			events.push("disconnect");
		},
		commitOffsets: async (
			offsets: { topic: string; partition: number; offset: string }[],
		) => {
			for (const position of offsets)
				events.push(`commit:${position.partition}:${position.offset}`);
		},
		seek: () => {},
		pause: () => {},
		resume: () => {},
	};
	const admin = {
		connect: async () => {},
		disconnect: async () => {},
		fetchOffsets: async () => [
			{
				topic,
				partitions: [{ partition, offset: committed[partition] ?? "-1" }],
			},
		],
		fetchTopicOffsets: async () => [
			{ partition, offset: "9", high: "9", low: "0" },
		],
		setOffsets: async ({
			partitions,
		}: {
			partitions: { partition: number; offset: string }[];
		}) => {
			events.push(
				`seed:${partitions.map(({ partition, offset }) => `${partition}=${offset}`).join(",")}`,
			);
		},
	};
	const kafka = {
		consumer: () => consumer,
		admin: () => admin,
	} as unknown as Pick<Kafka, "consumer" | "admin">;

	const deliver = async ({ records }: { records: Delivered[] }) => {
		if (!runConfig?.eachBatch) throw new Error("Consumer has not started");
		let resolved: string | undefined;
		const messages: KafkaMessage[] = records.map((record) => ({
			timestamp: "0",
			attributes: 0,
			headers: {},
			...record,
		}));
		const payload = {
			batch: {
				topic,
				partition,
				highWatermark: "100",
				messages,
				firstOffset: () => messages[0]?.offset ?? null,
				lastOffset: () => messages.at(-1)?.offset ?? "0",
				isEmpty: () => messages.length === 0,
				offsetLag: () => "0",
				offsetLagLow: () => "0",
			},
			resolveOffset: (offset: string) => {
				events.push(`resolve:${offset}`);
				resolved = offset;
			},
			heartbeat: async () => {
				heartbeats += 1;
				events.push("heartbeat");
				if (
					heartbeatFailsAfter !== undefined &&
					heartbeats > heartbeatFailsAfter
				)
					throw new Error("REBALANCE_IN_PROGRESS");
			},
			pause: () => () => {},
			uncommittedOffsets: () =>
				resolved === undefined
					? { topics: [] }
					: {
							topics: [
								{
									topic,
									partitions: [
										{ partition, offset: (BigInt(resolved) + 1n).toString() },
									],
								},
							],
						},
			commitOffsetsIfNecessary: async () => {
				if (resolved === undefined) return;
				await consumer.commitOffsets([
					{ topic, partition, offset: (BigInt(resolved) + 1n).toString() },
				]);
			},
			isRunning: () => running,
			isStale: () => false,
		} as unknown as EachBatchPayload;
		await runConfig.eachBatch(payload);
	};

	const crash = ({ restart }: { restart: boolean }) =>
		listeners.get("consumer.crash")?.({
			payload: { error: new Error("boom"), restart, groupId: "g" },
		} as ConsumerCrashEvent);

	return { kafka, events, deliver, crash, runConfig: () => runConfig };
};

const recordType = (payload: unknown) => {
	if (typeof payload === "object" && payload && "type" in payload)
		logged.push(String(payload.type));
};
const logger = { info: () => {}, warn: recordType, error: recordType };
const logged: string[] = [];

const startConsumer = async ({
	job,
	recordsPerSlice = 2,
	storedFence,
	...options
}: {
	job: StreamConsumer;
	recordsPerSlice?: number;
	heartbeatFailsAfter?: number;
	committed?: Record<number, string>;
	/** What partition_progress holds for the partition; undefined leaves the store out entirely. */
	storedFence?: { epoch: bigint; offset: bigint } | null;
}) => {
	const fake = createFakeKafka(options);
	const crashes: string[] = [];
	const db =
		storedFence === undefined
			? undefined
			: {
					execute: async () => ({
						rows: [
							{
								next_offset: "50",
								command_next_offset: null,
								owner_epoch: storedFence?.epoch ?? null,
								owner_fence_offset: storedFence?.offset ?? null,
							},
						],
					}),
				};
	const consumer = createStreamConsumer({
		ctx: {
			kafka: fake.kafka,
			logger: logger as never,
			db: db as never,
			onCrashed: ({ job: name }) => {
				crashes.push(name);
			},
		},
		config: { topic, groupIdPrefix: "local-herald", recordsPerSlice },
		streamConsumer: job,
	});
	await consumer.start();
	return { ...fake, consumer, crashes };
};

const offsetsOf = (records: StreamRecord[]) =>
	records.map(({ position }) => position.offset.toString()).join(",");

test("a job's group starts at the end of the log when it has no place, then reads from its place onward", async () => {
	const { events } = await startConsumer({
		job: { name: "usage-events", handle: async () => {} },
	});
	expect(events).toEqual([
		"seed:0=9",
		"connect",
		"subscribe:fromBeginning=true",
		"run:autoCommit=false",
	]);
});

test("a job with a place is not seeded again", async () => {
	const { events } = await startConsumer({
		job: { name: "usage-events", handle: async () => {} },
		committed: { 0: "42" },
	});
	expect(events[0]).toBe("connect");
});

test("a batch lands slice by slice: each slice is handled, resolved, heartbeat, and the batch committed once", async () => {
	const handled: string[] = [];
	const { events, deliver } = await startConsumer({
		job: {
			name: "usage-events",
			handle: async ({ records }) => {
				handled.push(offsetsOf(records));
			},
		},
	});
	events.length = 0;
	await deliver({
		records: ["0", "1", "2"].map((offset) => trackMessage({ offset })),
	});
	expect(handled).toEqual(["0,1", "2"]);
	expect(events).toEqual([
		"resolve:1",
		"heartbeat",
		"resolve:2",
		"heartbeat",
		`commit:${partition}:3`,
	]);
});

test("a heartbeat that reports a rebalance ends the batch after the slice in flight; later slices never reach the job", async () => {
	const handled: string[] = [];
	const { events, deliver } = await startConsumer({
		job: {
			name: "usage-events",
			handle: async ({ records }) => {
				handled.push(offsetsOf(records));
			},
		},
		heartbeatFailsAfter: 1,
	});
	events.length = 0;
	await expect(
		deliver({
			records: ["0", "1", "2", "3"].map((offset) => trackMessage({ offset })),
		}),
	).rejects.toThrow("REBALANCE_IN_PROGRESS");
	expect(handled).toEqual(["0,1", "2,3"]);
	expect(events).toEqual(["resolve:1", "heartbeat", "resolve:3", "heartbeat"]);
});

test("stopping herald while the store is down leaves the slice unresolved, so the next owner lands it", async () => {
	const attempts: string[] = [];
	const { events, deliver, consumer } = await startConsumer({
		job: {
			name: "usage-events",
			handle: async ({ records }) => {
				attempts.push(offsetsOf(records));
				throw new Error("Connection terminated unexpectedly");
			},
		},
	});
	events.length = 0;
	const delivery = deliver({
		records: ["0", "1"].map((offset) => trackMessage({ offset })),
	});
	await new Promise((resolve) => setTimeout(resolve, 20));
	await consumer.stop();
	await expect(delivery).rejects.toThrow(
		"Herald stopped before the slice landed",
	);
	expect(attempts).toEqual(["0,1"]);
	expect(events.filter((event) => event.startsWith("resolve"))).toEqual([]);
	expect(events).toContain("stop");
});

const stampedTrackMessage = ({
	offset,
	epoch,
}: {
	offset: string;
	epoch: string;
}) => ({ ...trackMessage({ offset }), headers: { ownerEpoch: epoch } });

test("a fence stored in partition_progress is honoured from the first batch after a restart", async () => {
	const handled: StreamRecord[][] = [];
	const { deliver } = await startConsumer({
		job: {
			name: "usage-events",
			handle: async ({ records }) => {
				handled.push(records);
			},
		},
		committed: { 0: "40" },
		storedFence: { epoch: 30n, offset: 12n },
	});
	await deliver({
		records: [
			stampedTrackMessage({ offset: "40", epoch: "20" }),
			stampedTrackMessage({ offset: "41", epoch: "30" }),
		],
	});
	expect(handled.map(offsetsOf)).toEqual(["41"]);
	expect(logged).toContain("herald_record_stale");
});

test("a record that cannot be read is skipped loudly and the rest of the slice lands", async () => {
	const handled: string[] = [];
	logged.length = 0;
	const { events, deliver } = await startConsumer({
		job: {
			name: "usage-events",
			handle: async ({ records }) => {
				handled.push(offsetsOf(records));
			},
		},
	});
	events.length = 0;
	await deliver({
		records: [trackMessage({ offset: "0" }), badMessage({ offset: "1" })],
	});
	expect(handled).toEqual(["0"]);
	expect(logged).toEqual(["herald_record_skipped"]);
	expect(events).toEqual(["resolve:1", "heartbeat", `commit:${partition}:2`]);
});

test("a consumer crash kafkajs will not restart is reported; one it restarts is not", async () => {
	const { crash, crashes } = await startConsumer({
		job: { name: "usage-events", handle: async () => {} },
	});
	crash({ restart: true });
	expect(crashes).toEqual([]);
	crash({ restart: false });
	expect(crashes).toEqual(["usage-events"]);
});

test("a job can work more partitions at once than herald's default", async () => {
	const job = (partitionsConsumedConcurrently?: number): StreamConsumer => ({
		name: "job",
		partitionsConsumedConcurrently,
		handle: async () => {},
	});
	const wide = await startConsumer({ job: job(32) });
	const narrow = await startConsumer({ job: job() });
	expect(wide.runConfig()?.partitionsConsumedConcurrently).toBe(32);
	expect(narrow.runConfig()?.partitionsConsumedConcurrently).toBe(8);
	await wide.consumer.stop();
	await narrow.consumer.stop();
});

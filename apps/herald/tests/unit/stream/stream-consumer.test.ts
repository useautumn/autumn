import { expect, test } from "bun:test";
import {
	computeTrack,
	createSubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import {
	KafkaConsumerLeaseLostError,
	serializeMeteringRecord,
} from "@autumn/kafka";
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
import { nativeConsumerConfigOf } from "../../../../../packages/kafka/src/client/librdkafka/consumer/nativeConsumerConfig.js";
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

type NativeGroupConfig = Parameters<typeof nativeConsumerConfigOf>[0]["config"];

type Delivered = {
	offset: string;
	key: Buffer | null;
	value: Buffer | null;
	timestamp?: string;
};

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
	const listeners = new Map<string, Set<(event: unknown) => void>>();
	const emit = (name: string, event: unknown) => {
		for (const listener of listeners.get(name) ?? []) listener(event);
	};
	let runConfig: ConsumerRunConfig | undefined;
	let running = false;
	let heartbeats = 0;
	const consumerConfigs: NativeGroupConfig[] = [];
	const consumer = {
		events: {
			CRASH: "consumer.crash",
			GROUP_JOIN: "consumer.group_join",
			REBALANCING: "consumer.rebalancing",
			END_BATCH_PROCESS: "consumer.end_batch_process",
			FETCH: "consumer.fetch",
		},
		on: (event: string, listener: (event: unknown) => void) => {
			const registered = listeners.get(event) ?? new Set();
			registered.add(listener);
			listeners.set(event, registered);
			return () => registered.delete(listener);
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
		consumer: (config: NativeGroupConfig) => {
			consumerConfigs.push(config);
			return consumer;
		},
		admin: () => admin,
	} as unknown as Pick<Kafka, "consumer" | "admin">;

	const deliver = async ({
		records,
		highWatermark = "100",
	}: {
		records: Delivered[];
		highWatermark?: string;
	}) => {
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
				highWatermark,
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

	const crash = ({
		restart,
		error = new Error("boom"),
	}: {
		restart: boolean;
		error?: Error;
	}) =>
		emit("consumer.crash", {
			payload: { error, restart, groupId: "g" },
		} as ConsumerCrashEvent);

	const joinGroup = () =>
		emit("consumer.group_join", {
			payload: { memberAssignment: { [topic]: [partition] } },
		});

	const fetchWithoutLanding = ({ highWatermark }: { highWatermark: string }) =>
		emit("consumer.end_batch_process", {
			payload: {
				topic,
				partition,
				highWatermark,
				batchSize: 3,
				lastOffset: "2",
			},
		});

	const completeFetch = () =>
		emit("consumer.fetch", { payload: { numberOfBatches: 0, duration: 1 } });

	return {
		kafka,
		events,
		consumerConfigs,
		deliver,
		crash,
		joinGroup,
		fetchWithoutLanding,
		completeFetch,
	};
};

const recordType = (payload: unknown) => {
	if (typeof payload !== "object" || !payload || !("type" in payload)) return;
	logged.push(String(payload.type));
	const data = "data" in payload ? payload.data : undefined;
	loggedLines.push({ type: String(payload.type), data });
};
const logger = { info: () => {}, warn: recordType, error: recordType };
const logged: string[] = [];
const loggedLines: { type: string; data: unknown }[] = [];

const startConsumer = async ({
	job,
	recordsPerSlice = 2,
	storedFence,
	now,
	...options
}: {
	job: StreamConsumer;
	recordsPerSlice?: number;
	heartbeatFailsAfter?: number;
	committed?: Record<number, string>;
	/** What partition_progress holds for the partition; undefined leaves the store out entirely. */
	storedFence?: { epoch: bigint; offset: bigint } | null;
	now?: () => number;
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
			now,
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

const MINUTE_MS = 60_000;

test("a job behind the log reports how long ago its last landed record was written", async () => {
	let nowMs = 100 * MINUTE_MS;
	const { deliver, joinGroup, consumer } = await startConsumer({
		job: { name: "usage-events", handle: async () => {} },
		now: () => nowMs,
	});
	joinGroup();
	await deliver({
		records: ["0", "1"].map((offset) => ({
			...trackMessage({ offset }),
			timestamp: String(60 * MINUTE_MS),
		})),
	});
	expect(consumer.health()).toMatchObject({
		maxLagRecords: 98,
		maxLagMs: 40 * MINUTE_MS,
	});
	nowMs += 25 * MINUTE_MS;
	expect(consumer.health().maxLagMs).toBe(65 * MINUTE_MS);
});

test("a job that has landed the whole log reports no lag", async () => {
	const { deliver, joinGroup, consumer } = await startConsumer({
		job: { name: "usage-events", handle: async () => {} },
		now: () => 100 * MINUTE_MS,
	});
	joinGroup();
	await deliver({
		records: [{ ...trackMessage({ offset: "1" }), timestamp: "1" }],
		highWatermark: "2",
	});
	expect(consumer.health()).toMatchObject({ maxLagRecords: 0, maxLagMs: 0 });
});

test("a job that has fetched but landed nothing counts its lag from joining the group", async () => {
	let nowMs = 100 * MINUTE_MS;
	const { joinGroup, fetchWithoutLanding, completeFetch, consumer } =
		await startConsumer({
			job: { name: "usage-events", handle: async () => {} },
			now: () => nowMs,
		});
	joinGroup();
	expect(consumer.health().maxLagMs).toBe(0);
	fetchWithoutLanding({ highWatermark: "100" });
	nowMs += 35 * MINUTE_MS;
	completeFetch();
	expect(consumer.health().maxLagMs).toBe(35 * MINUTE_MS);
});

test("a caught-up job whose fetches stop counts its lag from the last fetch", async () => {
	let nowMs = 100 * MINUTE_MS;
	const { deliver, joinGroup, completeFetch, consumer } = await startConsumer({
		job: { name: "usage-events", handle: async () => {} },
		now: () => nowMs,
	});
	joinGroup();
	completeFetch();
	await deliver({
		records: [{ ...trackMessage({ offset: "1" }), timestamp: String(nowMs) }],
		highWatermark: "2",
	});
	expect(consumer.health().maxLagMs).toBe(0);
	nowMs += 40 * MINUTE_MS;
	expect(consumer.health().maxLagMs).toBe(40 * MINUTE_MS);
	completeFetch();
	expect(consumer.health().maxLagMs).toBe(0);
});

test("a partition handed back after a rebalance counts its lag from the new join until a record lands", async () => {
	let nowMs = 100 * MINUTE_MS;
	const { deliver, joinGroup, completeFetch, consumer } = await startConsumer({
		job: { name: "usage-events", handle: async () => {} },
		now: () => nowMs,
	});
	joinGroup();
	await deliver({
		records: ["0", "1"].map((offset) => ({
			...trackMessage({ offset }),
			timestamp: String(60 * MINUTE_MS),
		})),
	});
	nowMs = 200 * MINUTE_MS;
	joinGroup();
	completeFetch();
	expect(consumer.health().maxLagMs).toBe(0);
	nowMs += 5 * MINUTE_MS;
	completeFetch();
	expect(consumer.health().maxLagMs).toBe(5 * MINUTE_MS);
});

test("a job still joining its group counts its lag from when it started joining", async () => {
	let nowMs = 100 * MINUTE_MS;
	const { consumer } = await startConsumer({
		job: { name: "usage-events", handle: async () => {} },
		now: () => nowMs,
	});
	nowMs += 45 * MINUTE_MS;
	expect(consumer.health()).toMatchObject({
		membership: "joining",
		partitions: 0,
		maxLagMs: 45 * MINUTE_MS,
	});
});

test("a job's consumer gives one poll's slices librdkafka's default 300 s before the member rewinds", async () => {
	const { consumerConfigs } = await startConsumer({
		job: { name: "usage-events", handle: async () => {} },
	});
	const [groupConfig] = consumerConfigs;
	if (!groupConfig) throw new Error("No consumer was created");
	expect(
		nativeConsumerConfigOf({ config: groupConfig })["max.poll.interval.ms"],
	).toBe(300_000);
});

test("a slice that takes 10 s or more to land is logged with its job, partition and duration", async () => {
	let nowMs = 0;
	const sliceDurationsMs = [12_000, 9_999];
	const { deliver } = await startConsumer({
		job: {
			name: "usage-events",
			handle: async () => {
				nowMs += sliceDurationsMs.shift() ?? 0;
			},
		},
		now: () => nowMs,
	});
	loggedLines.length = 0;
	await deliver({
		records: ["0", "1", "2", "3"].map((offset) => trackMessage({ offset })),
	});
	expect(loggedLines).toEqual([
		{
			type: "herald_slice_slow",
			data: {
				job: "usage-events",
				topic,
				partition,
				firstOffset: "0",
				records: 2,
				durationMs: 12_000,
			},
		},
	]);
});

test("a restart logs what its rewind to the last commit repeats: the records handed past it and how long they ran", async () => {
	let nowMs = 0;
	const { deliver, joinGroup, crash } = await startConsumer({
		job: {
			name: "usage-events",
			handle: async () => {
				nowMs += 30_000;
			},
		},
		heartbeatFailsAfter: 2,
		now: () => nowMs,
	});
	joinGroup();
	await deliver({
		records: ["0", "1"].map((offset) => trackMessage({ offset })),
	});
	await expect(
		deliver({
			records: ["2", "3", "4", "5"].map((offset) => trackMessage({ offset })),
		}),
	).rejects.toThrow("REBALANCE_IN_PROGRESS");
	loggedLines.length = 0;
	crash({
		restart: true,
		error: new KafkaConsumerLeaseLostError({ topic, partition }),
	});
	crash({ restart: true });
	expect(loggedLines).toEqual([
		{
			type: "herald_job_rewound",
			data: {
				job: "usage-events",
				groupId: "local-herald-usage-events",
				leaseLost: true,
				records: 4,
				longestRanMs: 60_000,
				rewound: [{ partition, records: 4, ranMs: 60_000 }],
			},
		},
		{
			type: "herald_job_rewound",
			data: {
				job: "usage-events",
				groupId: "local-herald-usage-events",
				leaseLost: false,
				records: 0,
				longestRanMs: 0,
				rewound: [],
			},
		},
	]);
});

/**
 * A blue/green flip over a real broker: two herald fleets told apart by fake service ARNs, one record
 * in a memory-backed S3 both poll, a producer running throughout.
 *
 * Contract under test:
 *   - Before the flip only blue's jobs are in the group; green idles and reports joined == 0.
 *   - Writing the record to green moves membership: green joins, blue leaves, every record lands,
 *     repeats stay within one slice per partition, the group's places equal the log's ends.
 *   - Writing it back is the same in reverse.
 *   - A SIGTERM on the idle fleet touches nothing.
 */
import { expect, test } from "bun:test";
import {
	computeTrack,
	createSubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import {
	activeSlotEdgeConfigOf,
	createSlotGate,
	type SlotGate,
} from "@autumn/blue-green";
import {
	createEdgeConfigStore,
	type EdgeConfigS3Client,
	type EdgeConfigStore,
} from "@autumn/edge-config";
import {
	createIdempotentProducerConfig,
	createKafka,
	createKafkaClient,
	type KafkaConsumerGroupTimings,
	serializeMeteringRecord,
} from "@autumn/kafka";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createSlotFollower } from "../../../src/slot/followSlot.js";
import { createStreamConsumer } from "../../../src/stream/createStreamConsumer.js";
import type {
	RunningStreamConsumer,
	StreamRecord,
} from "../../../src/stream/types/streamConsumer.js";

if (!process.env.KAFKA_BROKERS?.trim()) {
	throw new Error("KAFKA_BROKERS is required; run bun test:kafka");
}
const brokers = process.env.KAFKA_BROKERS.split(",").map((b) => b.trim());

const PARTITIONS = 4;
const RECORDS_PER_SLICE = 20;
const TIMINGS: KafkaConsumerGroupTimings = {
	fetchMaxWaitTimeMs: 100,
	heartbeatIntervalMs: 1_000,
	rebalanceTimeoutMs: 10_000,
	sessionTimeoutMs: 6_000,
};
const BLUE_ARN = "arn:aws:ecs:us-east-2:1:service/autumn/herald";
const GREEN_ARN = "arn:aws:ecs:us-east-2:1:service/autumn/herald-green";

const unique = (prefix: string) =>
	`${prefix}-${crypto.randomUUID().replaceAll("-", "")}`;
const logger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	debug: () => {},
} as never;

const createTestKafka = () =>
	createKafka(
		createKafkaClient({
			clientId: unique("herald-slot-flip"),
			brokers,
			transport: {},
			limits: {
				connectionTimeoutMs: 3_000,
				requestTimeoutMs: 10_000,
				retryCount: 3,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
		}),
	);

const trackMessage = () => {
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
		command: createTrackCommand({ value: 1 }),
	});
	return serializeMeteringRecord({
		record: { ...mutation, receipt: { fingerprint: "f", expiresAt: 1 } },
	});
};

const waitFor = async ({
	until,
	timeoutMs,
	what,
}: {
	until: () => boolean;
	timeoutMs: number;
	what: string;
}) => {
	const deadline = Date.now() + timeoutMs;
	while (!until()) {
		if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
		await Bun.sleep(50);
	}
};

/** One S3 object store shared by every fleet, so a record written by the "dashboard" is what all of them poll. */
const createMemoryS3Client = (): EdgeConfigS3Client => {
	const objects = new Map<string, string>();
	return {
		send: async (command) => {
			const { Key, Body } = command.input as { Key?: string; Body?: string };
			if (Body !== undefined) {
				objects.set(Key ?? "", Body);
				return {};
			}
			const stored = objects.get(Key ?? "");
			if (stored === undefined) {
				const missing = new Error("NoSuchKey");
				missing.name = "NoSuchKey";
				throw missing;
			}
			return { Body: { transformToString: async () => stored } };
		},
	};
};

const definition = activeSlotEdgeConfigOf({ serviceName: "herald" });
const createRecordStore = ({ s3Client }: { s3Client: EdgeConfigS3Client }) =>
	createEdgeConfigStore({
		ctx: {
			location: () => ({ bucket: "test", region: "us-east-2" }),
			s3Client,
		},
		s3Key: definition.key,
		schema: definition.schema,
		defaultValue: definition.defaultValue,
		pollIntervalMs: 200,
		retainOnError: true,
	});

const writeRecord = async ({
	store,
	blueArn,
}: {
	store: EdgeConfigStore<ReturnType<typeof definition.defaultValue>>;
	blueArn: string;
}) =>
	store.writeToSource({
		config: {
			activeTaskDefinitionArn: null,
			activeImageSha: null,
			flightcontrolBlueArn: blueArn,
			updatedAt: new Date().toISOString(),
		},
	});

type Ledger = { applied: Map<string, number> };
const positionKey = ({ position }: StreamRecord) =>
	`${position.partition}:${position.offset}`;

/** One herald task of one fleet: its own record store, gate, follower, and the jobs the slot builds. */
const createFleetTask = async ({
	serviceArn,
	s3Client,
	topic,
	groupIdPrefix,
	ledger,
}: {
	serviceArn: string;
	s3Client: EdgeConfigS3Client;
	topic: string;
	groupIdPrefix: string;
	ledger: Ledger;
}) => {
	const store = createRecordStore({ s3Client });
	await store.startPolling();
	const gate: SlotGate = createSlotGate({
		ctx: { identity: { serviceArn, imageSha: null }, activeSlot: store },
	});
	let jobs: RunningStreamConsumer[] = [];
	const buildJob = () =>
		createStreamConsumer({
			ctx: { kafka: createTestKafka(), logger, onCrashed: () => {} },
			config: {
				topic,
				groupIdPrefix,
				recordsPerSlice: RECORDS_PER_SLICE,
				timings: TIMINGS,
			},
			streamConsumer: {
				name: "ledger",
				handle: async ({ records }) => {
					await Bun.sleep(10);
					for (const record of records) {
						const key = positionKey(record);
						ledger.applied.set(key, (ledger.applied.get(key) ?? 0) + 1);
					}
				},
			},
		});
	const follower = createSlotFollower({
		ctx: {
			gate,
			jobs: {
				start: async () => {
					jobs = [buildJob()];
					for (const job of jobs) await job.start();
				},
				stop: async () => {
					const stopping = jobs;
					jobs = [];
					await Promise.all(stopping.map((job) => job.stop()));
				},
			},
			logger,
		},
	});
	return {
		follower,
		store,
		joined: () =>
			jobs.filter((job) => job.health().membership === "joined").length,
		stop: async () => {
			await follower.stop();
			store.stopPolling();
		},
	};
};

test("a flip moves the jobs from blue to green and back; every record lands, repeats stay within a slice", async () => {
	const kafka = createTestKafka();
	const topic = unique("herald-events");
	const admin = kafka.admin();
	await admin.connect();
	await admin.createTopics({
		topics: [{ topic, numPartitions: PARTITIONS, replicationFactor: 1 }],
	});
	const groupIdPrefix = unique("herald");
	const groupId = `${groupIdPrefix}-ledger`;
	const s3Client = createMemoryS3Client();
	const dashboard = createRecordStore({ s3Client });
	await writeRecord({ store: dashboard, blueArn: BLUE_ARN });
	const ledger: Ledger = { applied: new Map() };
	const fleet = (serviceArn: string) =>
		createFleetTask({ serviceArn, s3Client, topic, groupIdPrefix, ledger });

	const blue = [await fleet(BLUE_ARN), await fleet(BLUE_ARN)];
	const green = [await fleet(GREEN_ARN), await fleet(GREEN_ARN)];
	for (const task of [...blue, ...green]) await task.follower.start();
	expect(blue.map((task) => task.follower.readState())).toEqual([
		"active",
		"active",
	]);
	expect(green.map((task) => task.follower.readState())).toEqual([
		"idle",
		"idle",
	]);

	const producer = kafka.producer(
		createIdempotentProducerConfig({
			limits: { retryCount: 3, initialRetryTimeMs: 100, maxRetryTimeMs: 1_000 },
		}),
	);
	await producer.connect();
	const perPartition = 120;
	const total = PARTITIONS * perPartition;
	const producing = (async () => {
		for (let round = 0; round < perPartition / 10; round++) {
			for (let partition = 0; partition < PARTITIONS; partition++)
				await producer.send({
					topic,
					acks: -1,
					messages: Array.from({ length: 10 }, () => ({
						...trackMessage(),
						partition,
					})),
				});
			await Bun.sleep(150);
		}
	})();

	await waitFor({
		until: () => ledger.applied.size >= total / 8,
		timeoutMs: 30_000,
		what: "blue to land the first records",
	});
	await waitFor({
		until: () => blue.every((task) => task.joined() === 1),
		timeoutMs: 20_000,
		what: "blue's jobs to join",
	});
	expect(green.map((task) => task.joined())).toEqual([0, 0]);

	// ── The flip: the dashboard writes the record, every fleet polls it ──
	await writeRecord({ store: dashboard, blueArn: GREEN_ARN });
	await waitFor({
		until: () =>
			green.every((task) => task.follower.readState() === "active") &&
			blue.every((task) => task.follower.readState() === "idle"),
		timeoutMs: 30_000,
		what: "the fleets to follow the flip",
	});
	await waitFor({
		until: () => green.every((task) => task.joined() === 1),
		timeoutMs: 30_000,
		what: "green's jobs to join",
	});
	expect(blue.map((task) => task.joined())).toEqual([0, 0]);

	// ── And back ──
	await Bun.sleep(2_000);
	await writeRecord({ store: dashboard, blueArn: BLUE_ARN });
	await waitFor({
		until: () =>
			blue.every((task) => task.joined() === 1) &&
			green.every((task) => task.joined() === 0),
		timeoutMs: 30_000,
		what: "the flip back",
	});

	await producing;
	await waitFor({
		until: () => ledger.applied.size === total,
		timeoutMs: 60_000,
		what: `all ${total} records (have ${ledger.applied.size})`,
	});
	await Bun.sleep(1_000);

	const repeated = [...ledger.applied.values()].filter((count) => count > 1);
	// Two flips, each one pause per partition, at most one slice repeated per pause.
	expect(repeated.length).toBeLessThanOrEqual(
		PARTITIONS * 2 * RECORDS_PER_SLICE,
	);
	console.info(
		`slot-flip: ${total} records, ${repeated.length} repeated across two flips`,
	);

	const [entry] = await admin.fetchOffsets({ groupId, topics: [topic] });
	const ends = await admin.fetchTopicOffsets(topic);
	expect(
		Object.fromEntries(
			(entry?.partitions ?? []).map((p) => [p.partition, p.offset]),
		),
	).toEqual(Object.fromEntries(ends.map((p) => [p.partition, p.high])));

	// A SIGTERM on the idle fleet touches nothing: no membership to give up.
	const joinedBefore = blue.map((task) => task.joined());
	for (const task of green) await task.stop();
	await Bun.sleep(500);
	expect(blue.map((task) => task.joined())).toEqual(joinedBefore);

	for (const task of blue) await task.stop();
	await producer.disconnect();
	await admin.disconnect();
}, 240_000);

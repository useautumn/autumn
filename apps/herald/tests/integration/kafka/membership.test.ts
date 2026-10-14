import { expect, test } from "bun:test";
import {
	computeTrack,
	createSubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import {
	createIdempotentProducerConfig,
	createKafkaClient,
	type KafkaConsumerGroupTimings,
	serializeMeteringRecord,
} from "@autumn/kafka";
import { Kafka, logLevel } from "kafkajs";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
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

const unique = (prefix: string) =>
	`${prefix}-${crypto.randomUUID().replaceAll("-", "")}`;

const logger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	debug: () => {},
} as never;

const createTestKafka = () =>
	new Kafka(
		createKafkaClient({
			clientId: unique("herald-membership"),
			brokers,
			transport: { logLevel: logLevel.NOTHING },
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

const positionKey = ({ position }: StreamRecord) =>
	`${position.partition}:${position.offset}`;

type Ledger = { applied: Map<string, number> };

const createTopic = async ({
	kafka,
	partitions,
}: {
	kafka: Kafka;
	partitions: number;
}) => {
	const topic = unique("herald-events");
	const admin = kafka.admin();
	await admin.connect();
	await admin.createTopics({
		waitForLeaders: true,
		topics: [{ topic, numPartitions: partitions, replicationFactor: 1 }],
	});
	await admin.disconnect();
	return topic;
};

const createProducer = async ({ kafka }: { kafka: Kafka }) => {
	const producer = kafka.producer(
		createIdempotentProducerConfig({
			limits: { retryCount: 3, initialRetryTimeMs: 100, maxRetryTimeMs: 1_000 },
		}),
	);
	await producer.connect();
	return producer;
};

const produce = async ({
	producer,
	topic,
	partition,
	count,
}: {
	producer: Awaited<ReturnType<typeof createProducer>>;
	topic: string;
	partition: number;
	count: number;
}) => {
	const messages = Array.from({ length: count }, () => ({
		...trackMessage(),
		partition,
	}));
	await producer.send({ topic, acks: -1, messages });
};

const committedOffsets = async ({
	kafka,
	groupId,
	topic,
}: {
	kafka: Kafka;
	groupId: string;
	topic: string;
}) => {
	const admin = kafka.admin();
	await admin.connect();
	try {
		const [entry] = await admin.fetchOffsets({ groupId, topics: [topic] });
		const ends = await admin.fetchTopicOffsets(topic);
		return {
			committed: Object.fromEntries(
				(entry?.partitions ?? []).map(({ partition, offset }) => [
					partition,
					offset,
				]),
			),
			ends: Object.fromEntries(
				ends.map(({ partition, high }) => [partition, high]),
			),
		};
	} finally {
		await admin.disconnect();
	}
};

const createHeraldTask = ({
	name,
	topic,
	groupIdPrefix,
	ledger,
	holdMs,
}: {
	name: string;
	topic: string;
	groupIdPrefix: string;
	ledger: Ledger;
	holdMs: number;
}) => {
	let hold: Promise<void> | null = null;
	const crashes: unknown[] = [];
	const consumer: RunningStreamConsumer = createStreamConsumer({
		ctx: {
			kafka: createTestKafka(),
			logger,
			onCrashed: ({ cause }) => {
				crashes.push(cause);
			},
		},
		config: {
			topic,
			groupIdPrefix,
			recordsPerSlice: RECORDS_PER_SLICE,
			timings: TIMINGS,
		},
		streamConsumer: {
			name: "ledger",
			handle: async ({ records }) => {
				await Bun.sleep(holdMs);
				for (const record of records) {
					const key = positionKey(record);
					ledger.applied.set(key, (ledger.applied.get(key) ?? 0) + 1);
				}
				if (hold) await hold;
			},
		},
	});
	let release = () => {};
	return {
		name,
		consumer,
		crashes,
		holdNextSlice: () => {
			hold = new Promise<void>((resolve) => {
				release = resolve;
			});
		},
		releaseHeld: () => {
			hold = null;
			release();
		},
	};
};

test("members leave gracefully and die mid-slice; every record lands, deduped exactly once, and the dead member's late commit is refused", async () => {
	const kafka = createTestKafka();
	const topic = await createTopic({ kafka, partitions: PARTITIONS });
	const groupIdPrefix = unique("herald");
	const groupId = `${groupIdPrefix}-ledger`;
	const producer = await createProducer({ kafka });
	const ledger: Ledger = { applied: new Map() };
	const perPartition = 150;
	const total = PARTITIONS * perPartition;
	const task = (name: string) =>
		createHeraldTask({ name, topic, groupIdPrefix, ledger, holdMs: 15 });

	const a = task("a");
	const b = task("b");
	await a.consumer.start();
	await b.consumer.start();

	const producing = (async () => {
		for (let round = 0; round < perPartition / 10; round++) {
			for (let partition = 0; partition < PARTITIONS; partition++)
				await produce({ producer, topic, partition, count: 10 });
			await Bun.sleep(100);
		}
	})();

	await waitFor({
		until: () => ledger.applied.size >= total / 6,
		timeoutMs: 30_000,
		what: "the first records to land",
	});

	const appliedBeforeLeave = ledger.applied.size;
	await a.consumer.stop();
	const c = task("c");
	await c.consumer.start();
	await waitFor({
		until: () => ledger.applied.size > appliedBeforeLeave + 40,
		timeoutMs: 30_000,
		what: "records to land after the graceful leave",
	});

	b.holdNextSlice();
	await Bun.sleep(TIMINGS.sessionTimeoutMs + TIMINGS.rebalanceTimeoutMs);
	b.releaseHeld();

	await producing;
	await waitFor({
		until: () => ledger.applied.size === total,
		timeoutMs: 60_000,
		what: `all ${total} records (have ${ledger.applied.size})`,
	});
	await Bun.sleep(1_000);

	const repeated = [...ledger.applied.entries()].filter(
		([, count]) => count > 1,
	);
	const repeatedByPartition = new Map<string, number>();
	for (const [key] of repeated) {
		const partition = key.split(":")[0] ?? "";
		repeatedByPartition.set(
			partition,
			(repeatedByPartition.get(partition) ?? 0) + 1,
		);
	}
	for (const [partition, count] of repeatedByPartition)
		expect(
			count,
			`partition ${partition} repeated ${count}`,
		).toBeLessThanOrEqual(2 * RECORDS_PER_SLICE);
	expect(repeated.length).toBeGreaterThan(0);
	console.info(
		`membership: ${total} records, ${repeated.length} repeated across ${repeatedByPartition.size} partition(s)`,
	);

	const { committed, ends } = await committedOffsets({ kafka, groupId, topic });
	expect(committed).toEqual(ends);
	for (const member of [a, b, c]) expect(member.crashes).toEqual([]);

	await b.consumer.stop();
	await c.consumer.stop();
	await producer.disconnect();
}, 180_000);

test("a record produced to a partition that had none while herald was down is delivered on restart", async () => {
	const kafka = createTestKafka();
	const topic = await createTopic({ kafka, partitions: 2 });
	const groupIdPrefix = unique("herald");
	const producer = await createProducer({ kafka });
	const ledger: Ledger = { applied: new Map() };
	const task = () =>
		createHeraldTask({ name: "a", topic, groupIdPrefix, ledger, holdMs: 0 });

	const first = task();
	await first.consumer.start();
	await produce({ producer, topic, partition: 0, count: 3 });
	await waitFor({
		until: () => ledger.applied.size === 3,
		timeoutMs: 20_000,
		what: "partition 0 to land",
	});
	await first.consumer.stop();

	await produce({ producer, topic, partition: 1, count: 1 });

	const second = task();
	await second.consumer.start();
	await waitFor({
		until: () => ledger.applied.has("1:0"),
		timeoutMs: 20_000,
		what: "the quiet partition's record",
	});
	expect(ledger.applied.size).toBe(4);
	await second.consumer.stop();
	await producer.disconnect();
}, 60_000);

test("a brand-new job starts at the end of the log, not from the beginning", async () => {
	const kafka = createTestKafka();
	const topic = await createTopic({ kafka, partitions: 2 });
	const producer = await createProducer({ kafka });
	for (const partition of [0, 1])
		await produce({ producer, topic, partition, count: 25 });

	const ledger: Ledger = { applied: new Map() };
	const task = createHeraldTask({
		name: "a",
		topic,
		groupIdPrefix: unique("herald"),
		ledger,
		holdMs: 0,
	});
	await task.consumer.start();
	await produce({ producer, topic, partition: 0, count: 2 });
	await produce({ producer, topic, partition: 1, count: 3 });
	await waitFor({
		until: () => ledger.applied.size === 5,
		timeoutMs: 20_000,
		what: "only the records produced after the job started",
	});
	await Bun.sleep(500);
	expect(ledger.applied.size).toBe(5);
	expect([...ledger.applied.keys()].sort()).toEqual([
		"0:25",
		"0:26",
		"1:25",
		"1:26",
		"1:27",
	]);
	await task.consumer.stop();
	await producer.disconnect();
}, 60_000);

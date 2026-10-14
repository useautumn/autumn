import { performance } from "node:perf_hooks";
import type { TrackCommand } from "@autumn/balance-engine";
import type {
	IdempotencyClaim,
	IdempotencyClaimResult,
	IdempotencyKeyStore,
} from "@autumn/dynamodb";
import {
	createProgressTracker,
	createTopicConsumer,
	type KafkaConsumerClient,
	serializeCommandRecord,
	type TopicRecordHandler,
} from "@autumn/kafka";
import type {
	ConsumerRunConfig,
	EachBatchPayload,
	KafkaMessage,
} from "kafkajs";
import { createCommandRecordHandler } from "../../../src/kafka/commandConsumer/createCommandRecordHandler.js";
import type { PartitionRuntimePort } from "../../../src/partitions/types/partitions.js";
import {
	createInitializeRequest,
	createTrackCommand,
	testIdentity,
} from "../../fixtures/mutations.js";
import { createBenchProcessor } from "../track-throughput/createBenchProcessor.js";
import { scenarios } from "../track-throughput/scenarios.js";

/**
 * One customer's queued Atom tracks through the real kafka consumer loop, command handler, consume layer and
 * processor; Kafka, DynamoDB and the metering log are simulated with injected latency.
 */
const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
const total = Number(args.total ?? 10_000);
const claimMs = Number(args.claimMs ?? 0);
const appendMs = Number(args.appendMs ?? 10);
const applyMs = Number(args.applyMs ?? 5);
const fetchMs = Number(args.fetchMs ?? 2);
const offsetCommitMs = Number(args.offsetCommitMs ?? 3);
/** Producer rate in tracks/s; 0 means the whole backlog is on the partition before the consumer starts. */
const rate = Number(args.rate ?? 0);
const maxBytesPerPartition = Number(args.maxBytesPerPartition ?? 1_048_576);
const maxBatchSize = Number(args.maxBatchSize ?? 500);
const commitLingerMs = Number(args.commitLingerMs ?? 5);
const topic = "commands";
const partition = 0;

const sleep = (ms: number) =>
	ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

const scenario = scenarios.typical;
if (!scenario) throw new Error("scenario");
const bench = await createBenchProcessor({
	scenario,
	partition,
	latency: { appendMs, applyMs },
	serialize: true,
	writerLimits: { maxBatchSize, commitLingerMs },
});
await bench.processor.initialize({
	request: createInitializeRequest({
		state: scenario.stateFor({ identity: testIdentity }),
		commandId: "init_0",
		requestId: "req_init_0",
	}),
});

/** As the Atom hands a track in: its own requestId, idempotency key and journal seq (trackToCommand.ts:39–42). */
const atomTrack = (n: number): TrackCommand => ({
	...createTrackCommand({
		identity: testIdentity,
		commandId: `atomreq_${n}`,
		requestId: `atomreq_${n}`,
		featureId: scenario.features[0],
		value: 1,
		overageBehavior: "overflow",
		occurredAt: 1_700_000_000_000 + n,
	}),
	source: { atomId: "atom_1", writerId: "writer_1", seq: n + 1 },
	idempotency: { key: `track:atomreq_${n}`, ttlMs: 86_400_000 },
});

const log: KafkaMessage[] = Array.from({ length: total }, (_, n) => {
	const { key, value } = serializeCommandRecord({ record: atomTrack(n) });
	return {
		offset: String(n),
		key,
		value,
		timestamp: "0",
		attributes: 0,
		headers: {},
	};
});
const recordBytes = (log[0]?.value?.length ?? 0) + (log[0]?.key?.length ?? 0);
const maxRecordsPerFetch = Math.max(
	1,
	Math.floor(maxBytesPerPartition / (recordBytes + 70)),
);

const timings = {
	claim: [] as number[],
	hop: [] as number[],
	runInProcess: [] as number[],
	applyRecord: [] as number[],
	settleBatch: [] as number[],
	offsetCommit: [] as number[],
	batchSizes: [] as number[],
};
const claimed = new Set<string>();
/** A DynamoDB conditional put at `claimMs`; the only timing line around store.claim lives here, not in product code. */
const idempotencyKeys: IdempotencyKeyStore = {
	async claim(claim: IdempotencyClaim): Promise<IdempotencyClaimResult> {
		const started = performance.now();
		await sleep(claimMs);
		const outcome = claimed.has(claim.storageKey) ? "duplicate" : "claimed";
		claimed.add(claim.storageKey);
		timings.claim.push(performance.now() - started);
		return outcome;
	},
	async release({ storageKey }) {
		await sleep(claimMs);
		claimed.delete(storageKey);
	},
};

const runtime = {
	process: async (run: Parameters<PartitionRuntimePort["process"]>[0]) => {
		const called = performance.now();
		await Promise.resolve();
		const started = performance.now();
		timings.hop.push(started - called);
		try {
			return await run(bench.processor);
		} finally {
			timings.runInProcess.push(performance.now() - started);
		}
	},
} as unknown as PartitionRuntimePort;

let applied = 0;
const appliedAt: number[] = [];
const handler = createCommandRecordHandler({
	ctx: {
		findOwnedRuntime: () => runtime,
		readCommandNextOffset: () => null,
		idempotencyKeys,
		logger: {
			info: (message: string) => {
				if (message !== "Queued Atom track applied") return;
				applied += 1;
				appliedAt.push(performance.now());
			},
			warn: (message: string, fields?: unknown) =>
				console.error(message, fields),
		},
	},
});
const timedHandler: TopicRecordHandler = {
	...handler,
	async applyRecord(record) {
		const started = performance.now();
		try {
			return await handler.applyRecord(record);
		} finally {
			timings.applyRecord.push(performance.now() - started);
		}
	},
	async settleBatch(position) {
		const started = performance.now();
		await handler.settleBatch?.(position);
		timings.settleBatch.push(performance.now() - started);
	},
};

let runConfig: ConsumerRunConfig | undefined;
const noop = async () => undefined;
const consumer: KafkaConsumerClient = {
	connect: noop,
	subscribe: noop,
	run: async (config) => {
		runConfig = config;
	},
	stop: noop,
	disconnect: noop,
	commitOffsets: noop,
	seek: () => undefined,
	pause: () => undefined,
	resume: () => undefined,
	on: (() => () => undefined) as KafkaConsumerClient["on"],
	events: {
		GROUP_JOIN: "consumer.group_join",
		END_BATCH_PROCESS: "consumer.end_batch_process",
	} as KafkaConsumerClient["events"],
};
await createTopicConsumer({
	ctx: { consumer, handler: timedHandler, progress: createProgressTracker() },
	config: { topic },
}).start();

const payloadOf = (messages: KafkaMessage[]): EachBatchPayload => {
	let resolved: string | undefined;
	return {
		batch: {
			topic,
			partition,
			highWatermark: String(produced),
			messages,
			firstOffset: () => messages[0]?.offset ?? null,
			lastOffset: () => messages.at(-1)?.offset ?? "0",
			isEmpty: () => messages.length === 0,
			offsetLag: () => "0",
			offsetLagLow: () => "0",
		},
		resolveOffset: (offset: string) => {
			resolved = offset;
		},
		heartbeat: noop,
		pause: () => () => undefined,
		uncommittedOffsets: () => ({
			topics:
				resolved === undefined
					? []
					: [{ topic, partitions: [{ partition, offset: resolved }] }],
		}),
		commitOffsetsIfNecessary: async () => {
			const started = performance.now();
			await sleep(offsetCommitMs);
			timings.offsetCommit.push(performance.now() - started);
		},
		isRunning: () => true,
		isStale: () => false,
	} as unknown as EachBatchPayload;
};

let produced = rate > 0 ? 0 : total;
const started = performance.now();
const producer =
	rate > 0
		? setInterval(() => {
				produced = Math.min(
					total,
					Math.floor(((performance.now() - started) / 1000) * rate),
				);
			}, 1)
		: undefined;

/** kafkajs's fetch shape: minBytes 1 returns as soon as a record is there; one fetch in flight per partition. */
let position = 0;
while (position < total) {
	await sleep(fetchMs);
	while (produced <= position) await sleep(1);
	const end = Math.min(produced, position + maxRecordsPerFetch);
	const messages = log.slice(position, end);
	timings.batchSizes.push(messages.length);
	if (!runConfig?.eachBatch) throw new Error("consumer not running");
	await runConfig.eachBatch(payloadOf(messages));
	position = end;
}
const elapsedMs = performance.now() - started;
if (producer) clearInterval(producer);

const stat = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	const pct = (p: number) =>
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
	const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
	return {
		n: values.length,
		mean: Number(mean.toFixed(3)),
		p50: Number(pct(0.5).toFixed(3)),
		p99: Number(pct(0.99).toFixed(3)),
		sum: Math.round(values.reduce((a, b) => a + b, 0)),
	};
};
const decide = timings.runInProcess.map(
	(ms, i) => ms - (timings.claim[i] ?? 0),
);
const waitForRoom = timings.applyRecord.map(
	(ms, i) => ms - (timings.runInProcess[i] ?? 0) - (timings.hop[i] ?? 0),
);
console.log(
	JSON.stringify(
		{
			config: {
				total,
				claimMs,
				appendMs,
				applyMs,
				fetchMs,
				offsetCommitMs,
				rate,
				recordBytes,
				maxRecordsPerFetch,
				maxBatchSize,
				commitLingerMs,
			},
			elapsedMs: Math.round(elapsedMs),
			recordsPerSec: Math.round((total / elapsedMs) * 1000),
			appliedLogLines: applied,
			appliedPerSec: Math.round((applied / elapsedMs) * 1000),
			kafkaBatchSize: stat(timings.batchSizes),
			perRecordMs: {
				applyRecord: stat(timings.applyRecord),
				waitForRoom: stat(waitForRoom),
				hop: stat(timings.hop),
				claim: stat(timings.claim),
				decide: stat(decide),
			},
			perBatchMs: {
				settleBatch: stat(timings.settleBatch),
				offsetCommit: stat(timings.offsetCommit),
			},
			metering: bench.stats(),
		},
		null,
		1,
	),
);
await bench.processor.drain();
process.exit(0);

import {
	createKafkaClient,
	createKafkaTransport,
	createProducerSession,
	type MeteringRecord,
	serializeMeteringRecord,
} from "@autumn/kafka";
import { Kafka } from "kafkajs";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import type { Committer } from "../../../src/committer/types/committer.js";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import { createBalanceWorkerFetch } from "../../../src/http/fastPath/createBalanceWorkerFetch.js";
import type { BalanceWorkerRequestContext } from "../../../src/http/types/balanceWorkerHttp.js";
import { createWorkerProducerConfig } from "../../../src/init/workerConfig.js";
import { createMutationPublisher } from "../../../src/kafka/createMutationPublisher.js";
import { createWorkerProducer } from "../../../src/kafka/createWorkerProducer.js";
import { getBalanceWorkerLogger } from "../../../src/logging/getBalanceWorkerLogger.js";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { CommittedOutcomeAppender } from "../../../src/processor/writer/types/partitionWriter.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	createInitializeRequest,
	testIdentity,
} from "../../fixtures/mutations.js";
import { scenarios } from "../track-throughput/scenarios.js";

// The equality test pins the wall clock so two runs of the same requests build the same records.
const fixedClock = process.env.SPIKE_FIXED_CLOCK;
if (fixedClock) Date.now = () => Number(fixedClock);

export const SPIKE_TOPIC = process.env.SPIKE_TOPIC ?? "bw-spike-metering";
export const SPIKE_BROKERS = ["127.0.0.1:19092"];

/** Where the partition's records go: a stub that only encodes, kafkajs on this loop, or the Rust front. */
export type AppenderMode = "sim" | "kafkajs" | "remote";

export type RemoteAppend = (params: {
	topic: string;
	partition: number;
	records: { key: Buffer; value: Buffer }[];
}) => Promise<bigint>;

/** Commit mode and pipeline shape for the run: transactional (dev default) or idempotent (staging), depth 1 = stop-and-wait. */
export const SPIKE_COMMIT_MODE = (process.env.SPIKE_COMMIT_MODE ??
	"transactional") as "transactional" | "idempotent";
export const SPIKE_PIPELINE_DEPTH = Number(
	process.env.SPIKE_PIPELINE_DEPTH ?? 1,
);
export const SPIKE_LINGER_MS = Number(process.env.SPIKE_LINGER_MS ?? 5);
export const SPIKE_MAX_BATCH = Number(process.env.SPIKE_MAX_BATCH ?? 500);

const producerLimits = {
	transactionTimeoutMs: 30_000,
	maxInFlightRequests: Math.max(1, SPIKE_PIPELINE_DEPTH),
	retryCount: 8,
	initialRetryTimeMs: 5,
	maxRetryTimeMs: 1000,
};

/** Per-append timings for the run summary, printed on SIGTERM. */
export const appendStats = {
	appends: 0,
	records: 0,
	durationsMs: [] as number[],
	queuedMs: [] as number[],
	lingerMs: [] as number[],
};

function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return (
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
	);
}

export function summarizeAppends(): Record<string, number | string> {
	const s = appendStats;
	return {
		commitMode: SPIKE_COMMIT_MODE,
		depth: SPIKE_PIPELINE_DEPTH,
		lingerMs: SPIKE_LINGER_MS,
		appends: s.appends,
		records: s.records,
		recordsPerAppend: s.appends
			? Math.round((s.records / s.appends) * 10) / 10
			: 0,
		appendP50Ms: Math.round(percentile(s.durationsMs, 0.5) * 100) / 100,
		appendP99Ms: Math.round(percentile(s.durationsMs, 0.99) * 100) / 100,
		queuedP50Ms: Math.round(percentile(s.queuedMs, 0.5) * 100) / 100,
		queuedP99Ms: Math.round(percentile(s.queuedMs, 0.99) * 100) / 100,
		lingerP50Ms: Math.round(percentile(s.lingerMs, 0.5) * 100) / 100,
	};
}

async function kafkajsAppender(): Promise<CommittedOutcomeAppender> {
	const kafka = new Kafka(
		createKafkaClient({
			clientId: `bw-spike-${process.pid}`,
			brokers: SPIKE_BROKERS,
			transport: createKafkaTransport({ authMode: "none" }),
			limits: {
				connectionTimeoutMs: 5000,
				requestTimeoutMs: 30000,
				retryCount: 2,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1000,
			},
		}),
	);
	const session = createProducerSession({
		ctx: { kafka },
		config: createWorkerProducerConfig({
			deploymentEnvironment: "spike",
			topic: SPIKE_TOPIC,
			partition: 0,
			limits: producerLimits,
			mode: SPIKE_COMMIT_MODE,
		}),
	});
	await session.connect();
	// Idempotent mode fences with an owner record stamped with the epoch; the spike is epoch 1.
	const ownerEpoch = () =>
		SPIKE_COMMIT_MODE === "idempotent" ? "1" : undefined;
	const producer = createWorkerProducer({
		ctx: { session, ownerEpoch },
		config: { topic: SPIKE_TOPIC, partition: 0 },
	});
	await producer.fence();
	const publisher = createMutationPublisher({
		ctx: { producer, commit: { mode: SPIKE_COMMIT_MODE }, ownerEpoch },
	});
	return {
		...publisher,
		async appendCommitted(params) {
			const startedAt = performance.now();
			const appended = await publisher.appendCommitted(params);
			appendStats.appends += 1;
			appendStats.records += params.outcomes.length;
			appendStats.durationsMs.push(performance.now() - startedAt);
			if (params.waits) {
				if (params.waits.queuedMs !== null)
					appendStats.queuedMs.push(params.waits.queuedMs);
				appendStats.lingerMs.push(params.waits.lingerMs);
			}
			return appended;
		},
	};
}

/** The writer's contract unchanged: records leave as the bytes `serializeMeteringRecord` gives, the base offset comes back. */
function remoteAppender(append: RemoteAppend): CommittedOutcomeAppender {
	return {
		encodedBytesOf: ({ record }) => {
			const { key, value } = serializeMeteringRecord({ record });
			return key.length + value.length;
		},
		async appendCommitted({ topic, partition, outcomes }) {
			const records = outcomes.map((record) =>
				serializeMeteringRecord({ record }),
			);
			return { baseOffset: await append({ topic, partition, records }) };
		},
	};
}

function simAppender(): CommittedOutcomeAppender {
	let appended = 0n;
	return {
		encodedBytesOf: ({ record }) => {
			const { key, value } = serializeMeteringRecord({ record });
			return key.length + value.length;
		},
		async appendCommitted({ outcomes }) {
			for (const record of outcomes) serializeMeteringRecord({ record });
			const baseOffset = appended;
			appended += BigInt(outcomes.length);
			return { baseOffset };
		},
	};
}

/** One partition with one hot customer, the production writer limits, and the worker's real HTTP context. */
export async function createSpikeWorker({
	appenderMode,
	remoteAppend,
	onAppended,
}: {
	appenderMode: AppenderMode;
	remoteAppend?: RemoteAppend;
	onAppended?: (records: readonly MeteringRecord[]) => void;
}) {
	const scenario = scenarios[process.env.SPIKE_SCENARIO ?? "typical"];
	if (!scenario) throw new Error("scenario");
	const base =
		appenderMode === "kafkajs"
			? await kafkajsAppender()
			: appenderMode === "remote"
				? remoteAppender(
						remoteAppend ??
							(() => {
								throw new Error("remote appender needs remoteAppend");
							}),
					)
				: simAppender();
	const appender: CommittedOutcomeAppender = onAppended
		? {
				...base,
				appendCommitted(params) {
					onAppended(params.outcomes);
					return base.appendCommitted(params);
				},
			}
		: base;

	const committer: Committer = {
		async apply({ records, expectedOffset }) {
			const last = records.at(-1);
			return {
				nextOffset: last ? last.position.offset + 1n : expectedOffset,
			};
		},
		drain: async () => undefined,
		stop: () => undefined,
	};
	const stateStore = createCommitterStateStore({
		ctx: {
			committer,
			db: {
				readPartitionProgress: async () => null,
				insertPartitionProgress: async () => undefined,
				claimPartitionProgress: async () => undefined,
			},
		},
	});
	await stateStore.initializePartition({
		topic: SPIKE_TOPIC,
		partition: 0,
		nextOffset: 0n,
	});
	const db = createSyntheticWorkerDb();
	const processor = createPartitionProcessor({
		ctx: {
			stateStore: {
				...stateStore,
				readCommandNextOffset: () => null,
				advanceCommandNextOffset: async () => undefined,
			},
			catalogCache: createTestCatalogCache({ db, rows: scenario.catalogRows }),
			db,
			appender,
			receiptPolicy: { retentionMs: 86_400_000, now: () => Date.now() },
			recentCommands: createRecentCommands({
				windowMs: 600_000,
				now: () => Date.now(),
			}),
			assertCanRead: () => undefined,
		},
		config: {
			topic: SPIKE_TOPIC,
			partition: 0,
			writerLimits: {
				maxBatchSize: SPIKE_MAX_BATCH,
				maxPendingCommands: 4000,
				maxPendingCommandsPerCustomer: 1000,
				commitLingerMs: SPIKE_LINGER_MS,
				commitPipelineDepth: SPIKE_PIPELINE_DEPTH,
			},
		},
	});
	await processor.initialize({
		request: createInitializeRequest({
			state: scenario.stateFor({ identity: testIdentity }),
			commandId: "init_0",
			requestId: "req_init_0",
		}),
	});

	const runtime: BalanceWorkerRequestContext["runtime"] = {
		process: (run) => run(processor),
	};
	const ctx = {
		ownership: { findRuntime: () => runtime },
		partitionResolver: { partitionForIdentity: () => 0 },
		logger: getBalanceWorkerLogger(),
		requestLog: {
			successSampleRate: Number(process.env.SPIKE_LOG_RATE ?? 0.05),
		},
	};
	const app = createBalanceWorkerApp({ ctx });
	const fetch = createBalanceWorkerFetch({ ctx, app });
	return { processor, ctx, app, fetch };
}

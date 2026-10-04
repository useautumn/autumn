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

const producerLimits = {
	transactionTimeoutMs: 30_000,
	retryCount: 8,
	initialRetryTimeMs: 5,
	maxRetryTimeMs: 1000,
};

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
	const mode = (process.env.SPIKE_COMMIT_MODE ?? "transactional") as "transactional" | "idempotent";
	const session = createProducerSession({
		ctx: { kafka },
		config: createWorkerProducerConfig({
			deploymentEnvironment: "spike",
			topic: SPIKE_TOPIC,
			partition: 0,
			limits: producerLimits,
			mode,
		}),
	});
	const producer = createWorkerProducer({
		ctx: { session, ownerEpoch: () => "1" },
		config: { topic: SPIKE_TOPIC, partition: 0 },
	});
	await producer.connect();
	// Transactional: begins and aborts a transaction to bump the epoch. Idempotent: writes the owner fence record.
	await producer.fence();
	return createMutationPublisher({
		ctx: { producer, commit: { mode }, ownerEpoch: () => "1" },
	});
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
				maxBatchSize: 500,
				maxPendingCommands: 4000,
				maxPendingCommandsPerCustomer: 1000,
				commitLingerMs: 5,
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

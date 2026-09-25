import type { SubjectState } from "@autumn/balance-engine";
import { serializeMeteringRecord } from "@autumn/kafka";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import type { Committer } from "../../../src/committer/types/committer.js";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { CommittedOutcomeAppender } from "../../../src/processor/writer/types/partitionWriter.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import type { Scenario } from "./scenarios.js";

export type BenchLatency = { appendMs: number; applyMs: number };

const sleep = (ms: number) =>
	ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

/** The production shape: map baseline (postgres committer), Kafka serialization, simulated I/O latency. */
export const createBenchProcessor = async ({
	scenario,
	partition,
	latency,
	serialize,
}: {
	scenario: Scenario;
	partition: number;
	latency: BenchLatency;
	serialize: boolean;
}) => {
	const topic = "bench-metering";
	let appended = 0;
	let serializedBytes = 0;
	const appender: CommittedOutcomeAppender = {
		async appendCommitted({ outcomes }) {
			if (serialize) {
				for (const record of outcomes) {
					serializedBytes += serializeMeteringRecord({ record }).value.length;
				}
			}
			const baseOffset = BigInt(appended);
			appended += outcomes.length;
			await sleep(latency.appendMs);
			return { baseOffset };
		},
	};
	const committer: Committer = {
		async apply({ records, expectedOffset }) {
			await sleep(latency.applyMs);
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
			},
		},
	});
	await stateStore.initializePartition({ topic, partition, nextOffset: 0n });

	const db = createSyntheticWorkerDb();
	const catalogCache = createTestCatalogCache({
		db,
		rows: scenario.catalogRows,
	});
	const receiptPolicy = { retentionMs: 86_400_000, now: () => Date.now() };
	const recentCommands = createRecentCommands({
		windowMs: 600_000,
		now: () => Date.now(),
	});
	const writerLimits = {
		maxBatchSize: 100,
		maxPendingCommands: 1_000_000,
		maxPendingCommandsPerCustomer: 1_000_000,
	};
	const processor = createPartitionProcessor({
		ctx: {
			stateStore: {
				...stateStore,
				readCommandNextOffset: () => null,
				advanceCommandNextOffset: async () => undefined,
			},
			catalogCache,
			db,
			appender,
			receiptPolicy,
			recentCommands,
			assertCanRead: () => undefined,
		},
		config: { topic, partition, writerLimits },
	});

	return {
		processor,
		stats: () => ({ appended, serializedBytes }),
	};
};

export type BenchProcessor = Awaited<ReturnType<typeof createBenchProcessor>>;
export type SeedState = SubjectState;

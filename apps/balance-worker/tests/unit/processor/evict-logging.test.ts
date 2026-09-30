import { describe, expect, test } from "bun:test";
import type { EvictCommand } from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import type { Committer } from "../../../src/committer/types/committer.js";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";

const topic = "evict-logging";
const partition = 0;

const evictCommand: EvictCommand = {
	schemaVersion: 1,
	type: "evict",
	requestId: "req_evict",
	identity: {
		orgId: "org_1",
		env: "sandbox",
		customerId: "cus_1",
		entityId: "ent_1",
	},
	occurredAt: 1_700_000_000_000,
};

/** The production shape: the Postgres committer's store, and an appender that keeps what Kafka was sent. */
const createProcessor = async ({ logsEvicts }: { logsEvicts: boolean }) => {
	const appended: MeteringRecord[] = [];
	const committer: Committer = {
		apply: async ({ records, expectedOffset }) => ({
			nextOffset: (records.at(-1)?.position.offset ?? expectedOffset - 1n) + 1n,
		}),
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
	const processor = createPartitionProcessor({
		ctx: {
			stateStore: {
				...stateStore,
				readCommandNextOffset: () => null,
				advanceCommandNextOffset: async () => undefined,
			},
			catalogCache: createTestCatalogCache(),
			db: createSyntheticWorkerDb(),
			appender: {
				appendCommitted: async ({ outcomes }) => {
					const baseOffset = BigInt(appended.length);
					appended.push(...outcomes);
					return { baseOffset };
				},
			},
			receiptPolicy: { retentionMs: 86_400_000, now: () => 1_700_000_000_000 },
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
			assertCanRead: () => undefined,
		},
		config: {
			topic,
			partition,
			writerLimits: {
				maxBatchSize: 100,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 100,
			},
			logsEvicts,
		},
	});
	return { processor, appended };
};

describe("evict logging", () => {
	test("on, an evict appends one empty record naming the customer, after dropping it", async () => {
		const { processor, appended } = await createProcessor({ logsEvicts: true });

		const reply = await processor.evict({ command: evictCommand });

		expect(reply).toEqual({ evicted: false });
		expect(appended).toHaveLength(1);
		const [record] = appended;
		expect(record?.command.type).toBe("evict");
		expect(record?.changes).toEqual([]);
		expect(record?.identity).toEqual({
			...evictCommand.identity,
			entityId: null,
		});
		expect(record?.revision).toEqual({ before: 0, after: 1 });
		expect(record?.id).toBe(record?.command.commandId);
	});

	test("each evict is its own record, never deduped as a retry", async () => {
		const { processor, appended } = await createProcessor({ logsEvicts: true });

		await processor.evict({ command: evictCommand });
		await processor.evict({ command: evictCommand });

		expect(appended).toHaveLength(2);
		expect(appended[0]?.id).not.toBe(appended[1]?.id);
	});

	test("off, an evict drops the customer and appends nothing, as before", async () => {
		const { processor, appended } = await createProcessor({
			logsEvicts: false,
		});

		await processor.evict({ command: evictCommand });

		expect(appended).toEqual([]);
	});
});

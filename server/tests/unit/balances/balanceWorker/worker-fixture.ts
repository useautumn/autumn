import { createBalanceWorkerClient } from "@autumn/balance-worker-client";
import type { MeteringRecord } from "@autumn/kafka";
import { createBalanceWorkerApp } from "../../../../../apps/balance-worker/src/http/createBalanceWorkerApp.js";
import { createPartitionProcessor } from "../../../../../apps/balance-worker/src/processor/createPartitionProcessor.js";
import type { SqliteBalanceStateStore } from "../../../../../apps/balance-worker/src/state/sqliteBalanceStateStore.js";

export const topic = "request-integration";
export const partition = 0;
export const checkpointLimits = {
	maxSerializedBytes: 1_000_000,
	maxStates: 10,
	maxReceipts: 100,
};

export function createWorkerFixture({
	stateStore,
	records,
	now,
}: {
	stateStore: SqliteBalanceStateStore;
	records: MeteringRecord[];
	now: number;
}) {
	const processor = createPartitionProcessor({
		ctx: {
			stateStore,
			appender: {
				appendCommitted: async ({ outcomes }) => {
					const baseOffset = BigInt(records.length);
					records.push(...outcomes);
					return { baseOffset };
				},
			},
			trackReceiptPolicy: { retentionMs: 86_400_000, now: () => now },
			assertCanRead: () => undefined,
		},
		config: {
			topic,
			partition,
			writerLimits: {
				maxBatchSize: 10,
				maxPendingCommands: 10,
				maxPendingCommandsPerCustomer: 10,
			},
		},
	});
	const app = createBalanceWorkerApp({
		ctx: {
			ownership: {
				findRuntime: ({ routeEpoch }) =>
					routeEpoch === "1" ? { process: (run) => run(processor) } : undefined,
			},
			partitionResolver: { partitionForIdentity: () => partition },
			logger: {
				info: () => undefined,
				warn: () => undefined,
				error: () => undefined,
			},
		},
	});
	const client = createBalanceWorkerClient({
		ctx: {
			owners: {
				findOwner: () => ({
					partition,
					routeEpoch: "1",
					endpoint: "http://worker.test",
				}),
				refresh: async () => undefined,
			},
			http: {
				postJson: async ({ url, body, signal }) => {
					const response = await app.request(url, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body),
						signal,
					});
					return { status: response.status, body: await response.json() };
				},
			},
		},
		config: { partitionCount: 1, timeoutMs: 1_000 },
	});
	return { client, close: () => processor.drain() };
}

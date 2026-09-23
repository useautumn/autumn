import type { CatalogRow } from "@autumn/balance-engine";
import { createBalanceWorkerClient } from "@autumn/balance-worker-client";
import { createCatalogCache } from "@autumn/catalog-lru";
import type { MeteringRecord } from "@autumn/kafka";
import { createBalanceWorkerApp } from "../../../../../apps/balance-worker/src/http/createBalanceWorkerApp.js";
import { createPartitionProcessor } from "../../../../../apps/balance-worker/src/processor/createPartitionProcessor.js";
import { createRecentCommands } from "../../../../../apps/balance-worker/src/processor/writer/recentCommands/createRecentCommands.js";
import type { StateStore } from "../../../../../apps/balance-worker/src/state/types/stateStore.js";
import type { WorkerDb } from "../../../../../apps/balance-worker/src/types/workerDb.js";

export const topic = "request-integration";
export const partition = 0;
export const checkpointLimits = {
	maxSerializedBytes: 1_000_000,
	maxStates: 10,
	maxReceipts: 100,
};

/** `catalogRows` stands in for Postgres: a worker restored from a checkpoint holds no catalog and must fetch it. */
export function createWorkerFixture({
	stateStore,
	records,
	now,
	catalogRows = [],
}: {
	stateStore: StateStore;
	records: MeteringRecord[];
	now: number;
	catalogRows?: CatalogRow[];
}) {
	/** Postgres stand-in: no customers, and only the catalog rows the test hands over. */
	const db: WorkerDb = {
		getSubjectRows: async () => null,
		getBillingCycleAnchors: async () => ({}),
		claimCustomerByEmail: async () => null,
		promoteDuePooledContributions: async () => null,
		getCatalogRows: async () => ({
			entitlements: catalogRows.flatMap((row) =>
				row.table === "entitlements" ? [row.row] : [],
			),
			products: catalogRows.flatMap((row) =>
				row.table === "products" ? [row.row] : [],
			),
			features: catalogRows.flatMap((row) =>
				row.table === "features" ? [row.row] : [],
			),
			prices: catalogRows.flatMap((row) =>
				row.table === "prices" ? [row.row] : [],
			),
		}),
	};
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
			db,
			catalogCache: createCatalogCache({
				ctx: {
					db,
					config: { mutableRowTtlMs: 60_000, maxSizeBytes: 1_000_000 },
				},
			}),
			receiptPolicy: { retentionMs: 86_400_000, now: () => now },
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
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
				debug: () => undefined,
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

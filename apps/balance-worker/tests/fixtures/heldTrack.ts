import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createSubjectState,
	type MeteringIdentity,
	parseTrackCommand,
} from "@autumn/balance-engine";
import type { CatalogCache } from "@autumn/catalog-lru";
import { createPartitionProcessor } from "../../src/processor/createPartitionProcessor.js";
import { createRecentCommands } from "../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { CommittedOutcomeAppender } from "../../src/processor/writer/types/partitionWriter.js";
import { createCommitPositions } from "../../src/runtime/commitPositions/createCommitPositions.js";
import type { CommitPositions } from "../../src/runtime/commitPositions/types/commitPositions.js";
import { openStateStore } from "../../src/state/openStateStore.js";
import type { SqliteStateStore } from "../../src/state/types/stateStore.js";
import { createSyntheticWorkerDb, createTestCatalogCache } from "./catalog.js";
import {
	createCustomerEntitlement,
	restoreSubjectStates,
	testOrg,
} from "./mutations.js";

export const topic = "metering-events-v1";
export const partition = 1;
export const identity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};

export function trackCommand({
	commandId,
	value = 1,
	lock,
	who = identity,
}: {
	commandId: string;
	value?: number;
	lock?: boolean;
	who?: MeteringIdentity;
}) {
	return parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			org: testOrg,
			commandId,
			requestId: `req_${commandId}`,
			identity: who,
			featureId: "messages",
			internalFeatureId: "feat_messages",
			value,
			overageBehavior: "reject",
			properties: null,
			usageEvent: { name: "messages", idempotencyKey: null, id: null },
			occurredAt: 1_700_000_000_000,
			...(lock && {
				lock: {
					id: `lock_row_${commandId}`,
					lockId: `lock_${commandId}`,
					expiresAt: 1_800_000_000_000,
					expiryAction: "release",
				},
			}),
		},
	});
}

/** An appender whose appends the test releases, one per call to `release`. */
export function gatedAppender(): CommittedOutcomeAppender & {
	batches: number[];
	release(params?: { fail?: Error }): void;
} {
	const batches: number[] = [];
	const waiting: {
		resolve(result: { baseOffset: bigint }): void;
		reject(cause: Error): void;
		size: number;
	}[] = [];
	let nextOffset = 0n;
	return {
		batches,
		appendCommitted({ outcomes }) {
			const { promise, resolve, reject } = Promise.withResolvers<{
				baseOffset: bigint;
			}>();
			waiting.push({ resolve, reject, size: outcomes.length });
			return promise;
		},
		release({ fail } = {}) {
			const next = waiting.shift();
			if (!next) throw new Error("no append waiting");
			if (fail) return next.reject(fail);
			batches.push(next.size);
			const baseOffset = nextOffset;
			nextOffset += BigInt(next.size);
			next.resolve({ baseOffset });
		},
	};
}

export function processorOn({
	positions,
	appender,
	store,
	catalogCache = createTestCatalogCache(),
}: {
	positions: CommitPositions;
	appender: CommittedOutcomeAppender;
	store: SqliteStateStore & { storeGate?: () => Promise<void> };
	catalogCache?: CatalogCache;
}) {
	async function applyDurableMutations(
		params: Parameters<SqliteStateStore["applyDurableMutations"]>[0],
	) {
		await store.storeGate?.();
		return store.applyDurableMutations(params);
	}
	return createPartitionProcessor({
		ctx: {
			stateStore: { ...store, applyDurableMutations },
			appender,
			db: createSyntheticWorkerDb(),
			catalogCache,
			receiptPolicy: { retentionMs: 86_400_000, now: () => 1_700_000_000_000 },
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
			commitPositions: positions.sinkFor({ partition }),
			assertCanRead: () => {},
		},
		config: {
			topic,
			partition,
			writerLimits: {
				maxBatchSize: 100,
				maxPendingCommands: 1_000,
				maxPendingCommandsPerCustomer: 100,
			},
		},
	});
}

export function openStore(): {
	store: SqliteStateStore & { storeGate?: () => Promise<void> };
	close(): void;
} {
	const directory = mkdtempSync(join(tmpdir(), "autumn-held-track-"));
	const store = openStateStore({
		databasePath: join(directory, "balance-state.sqlite"),
	});
	store.initializePartition({ topic, partition, nextOffset: 0n });
	restoreSubjectStates({
		store,
		topic,
		partition,
		states: [
			createSubjectState({
				identity,
				customerEntitlements: [
					createCustomerEntitlement({
						id: "messages_monthly",
						featureId: "messages",
						balance: 100,
					}),
				],
			}),
		],
	});
	return {
		store,
		close() {
			store.close();
			rmSync(directory, { recursive: true, force: true });
		},
	};
}

/** A processor whose customer is resident: one ordinary track has loaded and committed it. */
export async function residentFixture({
	catalogCache,
}: {
	catalogCache?: CatalogCache;
} = {}) {
	const positions = createCommitPositions({ config: { partitionCount: 4 } });
	const appender = gatedAppender();
	const { store, close } = openStore();
	const processor = processorOn({ positions, appender, store, catalogCache });
	const warm = processor.track({
		command: trackCommand({ commandId: "warm" }),
	});
	await waitForAppend();
	appender.release();
	await warm;
	await processor.drain();
	return { positions, appender, store, processor, close };
}

export async function waitForAppend(): Promise<void> {
	for (let turn = 0; turn < 3; turn++)
		await new Promise<void>((resolve) => setImmediate(resolve));
}

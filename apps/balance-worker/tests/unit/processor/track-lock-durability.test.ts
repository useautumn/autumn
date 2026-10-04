import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MeteringRecord } from "@autumn/kafka";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import type { PartitionProcessor } from "../../../src/processor/types/partitionProcessor.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { CommittedOutcomeAppender } from "../../../src/processor/writer/types/partitionWriter.js";
import { openStateStore } from "../../../src/state/openStateStore.js";
import type { SqliteStateStore } from "../../../src/state/types/stateStore.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	createCustomerEntitlement,
	createState,
	createTrackCommand,
	restoreSubjectStates,
} from "../../fixtures/mutations.js";

const topic = "track-lock-durability";
const partition = 0;
const SETTLE_WINDOW_MS = 50;

class RecordingCommittedAppender implements CommittedOutcomeAppender {
	private nextOffset = 0n;

	async appendCommitted({
		outcomes,
	}: {
		topic: string;
		partition: number;
		outcomes: readonly MeteringRecord[];
	}): Promise<{ baseOffset: bigint }> {
		const baseOffset = this.nextOffset;
		this.nextOffset += BigInt(outcomes.length);
		return { baseOffset };
	}
}

/** Holds every store apply until opened, so a test can see who waits for the store. */
const gateStoreApplies = ({ store }: { store: SqliteStateStore }) => {
	const gate = Promise.withResolvers<void>();
	const gatedStore = new Proxy(store, {
		get(target, property) {
			if (property === "applyDurableMutations") {
				return async (
					params: Parameters<SqliteStateStore["applyDurableMutations"]>[0],
				) => {
					await gate.promise;
					return target.applyDurableMutations(params);
				};
			}
			const value = Reflect.get(target, property);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	return { gatedStore, openGate: () => gate.resolve() };
};

const settlesWithin = async ({
	promise,
	ms,
}: {
	promise: Promise<unknown>;
	ms: number;
}): Promise<boolean> =>
	Promise.race([promise.then(() => true), Bun.sleep(ms).then(() => false)]);

let directory: string;
let store: SqliteStateStore;
let processor: PartitionProcessor;
let openGate: () => void;

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), "autumn-track-lock-durability-"));
	store = openStateStore({ databasePath: join(directory, "state.sqlite") });
	store.initializePartition({ topic, partition, nextOffset: 0n });
	restoreSubjectStates({
		store,
		topic,
		partition,
		states: [
			createState({
				customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
			}),
		],
	});
	const gated = gateStoreApplies({ store });
	openGate = gated.openGate;
	processor = createPartitionProcessor({
		ctx: {
			stateStore: gated.gatedStore,
			appender: new RecordingCommittedAppender(),
			db: createSyntheticWorkerDb(),
			catalogCache: createTestCatalogCache(),
			receiptPolicy: { retentionMs: 86_400_000, now: () => 1_700_000_000_000 },
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
			assertCanRead: () => {},
		},
		config: {
			topic,
			partition,
			writerLimits: {
				maxBatchSize: 100,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 100,
			},
		},
	});
});

afterEach(() => {
	openGate();
	store.close();
	rmSync(directory, { recursive: true, force: true });
});

describe("track durability", () => {
	test("a plain track is answered once the log has it, before the store applies it", async () => {
		const reply = processor.track({
			command: createTrackCommand({ value: 2 }),
		});

		expect(await settlesWithin({ promise: reply, ms: SETTLE_WINDOW_MS })).toBe(
			true,
		);
	});

	test("a track that takes a lock is answered only once the store holds its row", async () => {
		const command = {
			...createTrackCommand({ value: 2 }),
			lock: {
				id: "lock_row_1",
				lockId: "lock_1",
				expiresAt: 1_700_086_400_000,
				expiryAction: "confirm" as const,
			},
		};
		const reply = processor.track({ command });

		expect(await settlesWithin({ promise: reply, ms: SETTLE_WINDOW_MS })).toBe(
			false,
		);

		openGate();
		expect((await reply).result.status).toBe("applied");
	});

	test("a run's lock track waits for the store alone; the plain tracks before it answer at the log", async () => {
		const plain = [1, 2].map((index) =>
			processor.track({
				command: createTrackCommand({ commandId: `plain_${index}`, value: 1 }),
			}),
		);
		const locked = processor.track({
			command: {
				...createTrackCommand({ commandId: "locked", value: 2 }),
				lock: {
					id: "lock_row_1",
					lockId: "lock_1",
					expiresAt: 1_700_086_400_000,
					expiryAction: "confirm" as const,
				},
			},
		});

		expect(
			await settlesWithin({
				promise: Promise.all(plain),
				ms: SETTLE_WINDOW_MS,
			}),
		).toBe(true);
		expect(await settlesWithin({ promise: locked, ms: SETTLE_WINDOW_MS })).toBe(
			false,
		);
		expect(processor.readCounters().trackRunMax).toBe(3);

		openGate();
		expect((await locked).result.status).toBe("applied");
	});
});

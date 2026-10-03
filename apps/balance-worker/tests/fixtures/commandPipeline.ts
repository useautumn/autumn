import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MeteringIdentity } from "@autumn/balance-engine";
import {
	type CommandRecord,
	type MeteringRecord,
	serializeCommandRecord,
} from "@autumn/kafka";
import { createCommandRecordHandler } from "../../src/kafka/commandConsumer/createCommandRecordHandler.js";
import type { PartitionRuntimePort } from "../../src/partitions/types/partitions.js";
import { createPartitionProcessor } from "../../src/processor/createPartitionProcessor.js";
import type { PartitionProcessor } from "../../src/processor/types/partitionProcessor.js";
import { createRecentCommands } from "../../src/processor/writer/recentCommands/createRecentCommands.js";
import { MutationBatchNotCommittedError } from "../../src/processor/writer/writerErrors.js";
import { openStateStore } from "../../src/state/openStateStore.js";
import type { SqliteStateStore } from "../../src/state/types/stateStore.js";
import { createSyntheticWorkerDb, createTestCatalogCache } from "./catalog.js";
import { createFakeIdempotencyKeys } from "./idempotencyKeys.js";
import {
	createState,
	restoreSubjectStates,
	testOccurredAt,
} from "./mutations.js";

const topic = "commands-pipelining";
const partition = 0;
/** One broker round trip: long enough that records decided meanwhile can share the next commit. */
export const APPEND_MS = 3;

export const identityOf = ({
	customerId,
}: {
	customerId: string;
}): MeteringIdentity => ({
	orgId: "org_1",
	env: "sandbox",
	customerId,
	entityId: null,
});

export const customers = ["cus_1", "cus_2", "cus_3"];

/** The production shape around one partition: the real processor and writer, a store whose
 *  applies advance the command bookmark from each record's source, and an appender that
 *  takes a broker round trip per commit. */
export const createPipeline = ({
	failAppendAt,
	firstAppendHeld = Promise.resolve(),
}: {
	/** The nth commit (0-based) the broker refuses outright. */
	failAppendAt?: number;
	/** The first commit stays in flight until this resolves. */
	firstAppendHeld?: Promise<void>;
} = {}) => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-command-pipelining-"));
	const store = openStateStore({
		databasePath: join(directory, "balance-state.sqlite"),
	});
	store.initializePartition({ topic, partition, nextOffset: 0n });
	restoreSubjectStates({
		store,
		topic,
		partition,
		states: customers.map((customerId) =>
			createState({ identity: identityOf({ customerId }), balance: 1_000 }),
		),
	});

	const batches: MeteringRecord[][] = [];
	const bookmarks: bigint[] = [];
	const parked: { partition: number; cause: unknown }[] = [];
	let appends = 0;
	let processed = 0;
	let bookmark: bigint | null = null;
	function advanceBookmark({ to }: { to: bigint }): void {
		if (bookmark !== null && bookmark >= to) return;
		bookmark = to;
		bookmarks.push(to);
	}

	const stateStore: SqliteStateStore = {
		...store,
		applyDurableMutations: ({ records }) => {
			const results = store.applyDurableMutations({ records });
			for (const { mutation } of records)
				if (mutation.source)
					advanceBookmark({ to: BigInt(mutation.source.commandOffset) + 1n });
			return results;
		},
		readCommandNextOffset: () => bookmark,
		advanceCommandNextOffset: ({ commandNextOffset }) =>
			advanceBookmark({ to: commandNextOffset }),
	};

	const processor = createPartitionProcessor({
		ctx: {
			stateStore,
			appender: {
				appendCommitted: async ({ outcomes }) => {
					const attempt = appends++;
					if (attempt === 0) await firstAppendHeld;
					await Bun.sleep(APPEND_MS);
					if (attempt === failAppendAt)
						throw new MutationBatchNotCommittedError({
							cause: new Error("CONCURRENT_TRANSACTIONS"),
						});
					const baseOffset = BigInt(batches.flat().length);
					batches.push([...outcomes]);
					return { baseOffset };
				},
				settleCommandOffset: () => undefined,
			},
			db: createSyntheticWorkerDb(),
			catalogCache: createTestCatalogCache(),
			receiptPolicy: { retentionMs: 86_400_000, now: () => testOccurredAt },
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
			assertCanRead: () => undefined,
		},
		config: {
			topic,
			partition,
			writerLimits: {
				maxBatchSize: 100,
				maxPendingCommands: 1_000,
				maxPendingCommandsPerCustomer: 1_000,
			},
		},
	});

	const runtime = {
		process: (run: (processor: PartitionProcessor) => Promise<unknown>) => {
			processed++;
			return run(processor);
		},
	} as unknown as PartitionRuntimePort;
	const handler = createCommandRecordHandler({
		ctx: {
			findOwnedRuntime: () => runtime,
			readCommandNextOffset: () => bookmark,
			idempotencyKeys: createFakeIdempotencyKeys().keys,
			markUnavailable: (failure) => {
				parked.push(failure);
			},
		},
	});

	/** What the topic consumer does with one fetched batch: each record in order, then settle before the offset commit. */
	async function consumeBatch({
		commands,
	}: {
		commands: CommandRecord[];
	}): Promise<void> {
		for (const [offset, record] of commands.entries()) {
			await handler.applyRecord({
				topic,
				partition,
				message: {
					offset: String(offset),
					...serializeCommandRecord({ record }),
				},
			});
			if (parked.length > 0) return;
			// The consumer heartbeats between records; that turn is where the writer's commit loop runs.
			await new Promise<void>((resolve) => setImmediate(resolve));
		}
		await handler.settleBatch?.({ topic, partition });
	}

	async function close(): Promise<void> {
		await processor.drain().catch(() => undefined);
		store.close();
		rmSync(directory, { recursive: true, force: true });
	}

	return {
		processor,
		readState: ({ customerId }: { customerId: string }) =>
			store.readState({ identity: identityOf({ customerId }) }),
		consumeBatch,
		batches,
		bookmarks,
		parked,
		close,
		readBookmark: () => bookmark,
		readProcessed: () => processed,
		committedSources: () =>
			batches
				.flat()
				.flatMap((record) =>
					record.source ? [Number(record.source.commandOffset)] : [],
				),
	};
};

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
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

const topic = "commands-pipeline";
const partition = 0;
/** One broker round trip: long enough that records decided meanwhile can share the next commit. */
export const APPEND_MS = 3;
export const STARTING_BALANCE = 1_000;
export const customers = ["cus_1", "cus_2", "cus_3"];

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

/** One partition as production wires it: the real processor and writer, a store whose applies
 *  move the command bookmark from each record's source, and a broker round trip per commit. */
export const createCommandPipeline = ({
	failAppendAt,
	heldAppend,
	states = [],
	decidesQueuedTrackRuns = true,
}: {
	/** Off applies every queued track alone: the reference runs must equal. */
	decidesQueuedTrackRuns?: boolean;
	/** Subjects resident beside the default customers. */
	states?: SubjectState[];
	/** The nth commit (0-based) the broker refuses outright. */
	failAppendAt?: number;
	/** The nth commit (0-based) stays in flight until `until` resolves. */
	heldAppend?: { at: number; until: Promise<void> };
} = {}) => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-command-pipeline-"));
	const store = openStateStore({
		databasePath: join(directory, "balance-state.sqlite"),
	});
	store.initializePartition({ topic, partition, nextOffset: 0n });
	restoreSubjectStates({
		store,
		topic,
		partition,
		states: [
			...customers.map((customerId) =>
				createState({
					identity: identityOf({ customerId }),
					balance: STARTING_BALANCE,
				}),
			),
			...states,
		],
	});

	const commits: MeteringRecord[][] = [];
	/** Every bookmark advance asked of the store, in order, including ones it already passed. */
	const bookmarks: bigint[] = [];
	const parked: { partition: number; cause: unknown }[] = [];
	const logs: string[] = [];
	let appends = 0;
	let decides = 0;
	let bookmark: bigint | null = null;
	function advanceBookmark({ to }: { to: bigint }): void {
		bookmarks.push(to);
		if (bookmark !== null && bookmark >= to) return;
		bookmark = to;
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
					if (attempt === heldAppend?.at) await heldAppend.until;
					await Bun.sleep(APPEND_MS);
					if (attempt === failAppendAt)
						throw new MutationBatchNotCommittedError({
							cause: new Error("CONCURRENT_TRANSACTIONS"),
						});
					const baseOffset = BigInt(commits.flat().length);
					commits.push([...outcomes]);
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
			decides++;
			return run(processor);
		},
	} as unknown as PartitionRuntimePort;
	const handler = createCommandRecordHandler({
		ctx: {
			findOwnedRuntime: () => runtime,
			readCommandNextOffset: () => bookmark,
			decidesQueuedTrackRuns,
			idempotencyKeys: createFakeIdempotencyKeys().keys,
			logger: {
				info: (...args: unknown[]) => logs.push(`info:${args[0]}`),
				warn: (...args: unknown[]) => logs.push(`warn:${args[0]}`),
			},
			markUnavailable: (failure) => {
				parked.push(failure);
			},
		},
	});

	/** What the topic consumer does with one fetched batch: each record in order, then the batch settles before its offset commits. */
	async function consumeBatch({
		commands,
		firstOffset = 0,
		beforeEach,
	}: {
		commands: CommandRecord[];
		firstOffset?: number;
		/** Runs before each record is handed over, as another request arriving on the partition would. */
		beforeEach?: (params: { index: number }) => void;
	}): Promise<void> {
		const messages = commands.map((record, index) => ({
			offset: String(firstOffset + index),
			...serializeCommandRecord({ record }),
		}));
		for (let index = 0; index < messages.length; ) {
			beforeEach?.({ index });
			// As the topic consumer does: the handler may take several records from here as one run.
			const length =
				handler.runLength?.({ topic, partition, messages, start: index }) ?? 1;
			const message = messages[index];
			if (!message) break;
			if (length > 1 && handler.applyRun)
				await handler.applyRun({
					topic,
					partition,
					messages: messages.slice(index, index + length),
				});
			else await handler.applyRecord({ topic, partition, message });
			if (parked.length > 0) return;
			// The consumer's heartbeat between records is where the writer's commit loop gets its turn.
			await new Promise<void>((resolve) => setImmediate(resolve));
			index += Math.max(1, length);
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
		consumeBatch,
		/** Waits for every commit and store apply, as a handoff does. */
		drain: () => processor.drain(),
		close,
		commits,
		bookmarks,
		parked,
		logs,
		readState: ({ customerId }: { customerId: string }) =>
			store.readState({ identity: identityOf({ customerId }) }),
		readBookmark: () => bookmark,
		readDecides: () => decides,
		/** Command offsets in the order Kafka took their records. */
		committedSources: () =>
			commits
				.flat()
				.flatMap((record) =>
					record.source ? [Number(record.source.commandOffset)] : [],
				),
	};
};

export type CommandPipeline = ReturnType<typeof createCommandPipeline>;

/**
 * A read reports the log offset it covers: every record of the partition at or below it is in the state it returns.
 * Sampled in the same synchronous step as the state, from what the writer and store already hold.
 *
 *  1.1 a fresh partition reads "0"; 1.2 before its first append, the store's bookmark less one;
 *  1.3 after an append, that record's offset; 1.4 a decided track not yet appended is in the state, the offset stays;
 *  1.5 an evict dropped but not yet logged reads below the evict; 1.6 once logged, at or above it;
 *  1.7 a successor on the same store reads at or above its predecessor; 1.8 never decreasing across appends.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	parseReadSubjectStateCommand,
	type ReadSubjectStateCommand,
} from "@autumn/balance-engine";
import type { ReadSubjectStateReply } from "@autumn/balance-worker-client/protocol";
import type { MeteringRecord } from "@autumn/kafka";
import type { SubjectRowsEnvelope } from "@autumn/postgres";
import { AppEnv } from "@autumn/shared";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import type { Committer } from "../../../src/committer/types/committer.js";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import type { PartitionProcessor } from "../../../src/processor/types/partitionProcessor.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
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
	testIdentity,
	testOccurredAt,
	testOrg,
} from "../../fixtures/mutations.js";

const topic = "read-log-offset";
const partition = 0;

/** Kafka as this owner sees it: offsets continue from `nextOffset`, and an append can be held at a gate the test opens. */
const createGatedAppender = ({ nextOffset }: { nextOffset: bigint }) => {
	let offset = nextOffset;
	let gate: { reached(): void; held: Promise<void> } | null = null;
	const appended: MeteringRecord[] = [];
	return {
		appended,
		/** The next append signals `reached` when it starts, then waits for `release`. */
		holdNextAppend: () => {
			const reached = Promise.withResolvers<void>();
			const held = Promise.withResolvers<void>();
			gate = { reached: () => reached.resolve(), held: held.promise };
			return { reached: reached.promise, release: () => held.resolve() };
		},
		appender: {
			appendCommitted: async ({
				outcomes,
			}: {
				outcomes: readonly MeteringRecord[];
			}) => {
				const waiting = gate;
				gate = null;
				waiting?.reached();
				if (waiting) await waiting.held;
				const baseOffset = offset;
				offset += BigInt(outcomes.length);
				appended.push(...outcomes);
				return { baseOffset };
			},
		},
	};
};

const createProcessor = ({
	store,
	appender,
	db = createSyntheticWorkerDb(),
}: {
	store: Parameters<typeof createPartitionProcessor>[0]["ctx"]["stateStore"];
	db?: ReturnType<typeof createSyntheticWorkerDb>;
	appender: ReturnType<typeof createGatedAppender>["appender"];
}): PartitionProcessor =>
	createPartitionProcessor({
		ctx: {
			stateStore: store,
			appender,
			db,
			catalogCache: createTestCatalogCache(),
			receiptPolicy: { retentionMs: 86_400_000, now: () => testOccurredAt },
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
			logsEvicts: true,
		},
	});

const readCommand: ReadSubjectStateCommand = parseReadSubjectStateCommand({
	input: {
		schemaVersion: 1,
		requestId: "req_read",
		identity: testIdentity,
		occurredAt: testOccurredAt,
		type: "readSubjectState",
		org: testOrg,
	},
});

const read = (processor: PartitionProcessor): Promise<ReadSubjectStateReply> =>
	processor.readSubjectState({ command: readCommand });

const balanceOf = (reply: ReadSubjectStateReply) =>
	reply.state.customerEntitlements[0]?.balance;

const evictCustomer = (processor: PartitionProcessor) =>
	processor.evict({
		command: {
			schemaVersion: 1,
			type: "evict",
			requestId: "req_evict",
			identity: testIdentity,
			occurredAt: testOccurredAt,
		},
	});

let directory: string;
let store: SqliteStateStore;

/** cus_1 with 10 messages, held by a store whose bookmark is `nextOffset`. */
const openStoreAt = ({ nextOffset }: { nextOffset: bigint }) => {
	store.initializePartition({ topic, partition, nextOffset });
	restoreSubjectStates({
		store,
		topic,
		partition,
		nextOffset,
		states: [
			createState({
				customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
			}),
		],
	});
};

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), "autumn-read-log-offset-"));
	store = openStateStore({ databasePath: join(directory, "state.sqlite") });
});

afterEach(() => {
	store.close();
	rmSync(directory, { recursive: true, force: true });
});

describe("the offset a read covers", () => {
	test("1.1 a fresh partition, nothing appended, reads 0", async () => {
		openStoreAt({ nextOffset: 0n });
		const { appender } = createGatedAppender({ nextOffset: 0n });
		const reply = await read(createProcessor({ store, appender }));
		expect(reply.logOffset).toBe("0");
	});

	test("1.2 before this owner's first append, the store's bookmark less one", async () => {
		openStoreAt({ nextOffset: 50n });
		const { appender } = createGatedAppender({ nextOffset: 50n });
		const reply = await read(createProcessor({ store, appender }));
		expect(reply.logOffset).toBe("49");
	});

	test("1.3 + 1.4 (R3) a decided track is read before it is appended, at the old offset; once appended, at its own", async () => {
		openStoreAt({ nextOffset: 50n });
		const kafka = createGatedAppender({ nextOffset: 50n });
		const processor = createProcessor({ store, appender: kafka.appender });

		const first = await read(processor);
		const again = await read(processor);
		expect([first.logOffset, again.logOffset]).toEqual(["49", "49"]);

		const append = kafka.holdNextAppend();
		const tracked = processor.track({
			command: createTrackCommand({ value: 4 }),
		});
		await append.reached;
		const whileHeld = await read(processor);
		expect(kafka.appended).toHaveLength(0);
		expect(whileHeld.logOffset).toBe("49");
		expect(balanceOf(whileHeld)).toBe(6);

		append.release();
		await tracked;
		const afterAppend = await read(processor);
		expect(afterAppend.logOffset).toBe("50");
		expect(balanceOf(afterAppend)).toBe(6);
	});

	test("1.7 (R12) a successor on the same store reads at or above every offset its predecessor reported", async () => {
		openStoreAt({ nextOffset: 50n });
		const kafka = createGatedAppender({ nextOffset: 50n });
		const predecessor = createProcessor({ store, appender: kafka.appender });
		await predecessor.track({ command: createTrackCommand({ value: 4 }) });
		const last = await read(predecessor);
		await predecessor.drain();
		predecessor.dispose();

		const successor = createProcessor({
			store,
			appender: createGatedAppender({ nextOffset: 51n }).appender,
		});
		const first = await read(successor);
		expect(BigInt(first.logOffset ?? "-1")).toBeGreaterThanOrEqual(
			BigInt(last.logOffset ?? "0"),
		);
		expect(balanceOf(first)).toBe(6);
	});

	test("1.8 reads between twenty appends never go backwards", async () => {
		openStoreAt({ nextOffset: 0n });
		const kafka = createGatedAppender({ nextOffset: 0n });
		const processor = createProcessor({ store, appender: kafka.appender });
		const offsets: bigint[] = [];
		for (let index = 0; index < 20; index++) {
			const tracked = processor.track({
				command: createTrackCommand({
					commandId: `cmd_${index}`,
					value: 0.1,
				}),
			});
			offsets.push(BigInt((await read(processor)).logOffset ?? "-1"));
			await tracked;
			offsets.push(BigInt((await read(processor)).logOffset ?? "-1"));
		}
		const sorted = [...offsets].sort((left, right) =>
			left < right ? -1 : left > right ? 1 : 0,
		);
		expect(offsets).toEqual(sorted);
		expect(offsets.at(-1)).toBe(19n);
	});
});

/** cus_1's own rows as Postgres answers a full read: empty, but a customer. */
const customerRows: SubjectRowsEnvelope = {
	customer: {
		internal_id: "cus_1_internal",
		id: "cus_1",
		org_id: "org_1",
		env: AppEnv.Sandbox,
		created_at: testOccurredAt,
		processor: null,
		metadata: null,
		send_email_receipts: false,
		config: null,
		spend_limits: null,
		overage_allowed: null,
		usage_limits: null,
		usage_alerts: null,
	},
	customer_products: [],
	customer_prices: [],
	customer_entitlements: [],
	rollovers: [],
	replaceables: [],
	usage_windows: [],
	pooled_balances: [],
	customer_licenses: [],
	open_locks: [],
	entity: null,
};

/** The production shape for evicts: the Postgres committer's store, whose evicts are logged, over a Postgres that counts full reads. */
const createCommitterProcessor = async () => {
	const committer: Committer = {
		apply: async ({ records, expectedOffset }) => ({
			nextOffset: (records.at(-1)?.position.offset ?? expectedOffset - 1n) + 1n,
		}),
		drain: async () => undefined,
		stop: () => undefined,
	};
	const committerStore = createCommitterStateStore({
		ctx: {
			committer,
			db: {
				readPartitionProgress: async () => null,
				insertPartitionProgress: async () => undefined,
				claimPartitionProgress: async () => undefined,
			},
		},
	});
	await committerStore.initializePartition({
		topic,
		partition,
		nextOffset: 0n,
	});
	const fullReads: string[] = [];
	const db = {
		...createSyntheticWorkerDb(),
		getSubjectRows: async () => {
			fullReads.push("cus_1");
			return customerRows;
		},
	};
	const kafka = createGatedAppender({ nextOffset: 0n });
	const processor = createProcessor({
		store: {
			...committerStore,
			readCommandNextOffset: () => null,
			advanceCommandNextOffset: async () => undefined,
		},
		appender: kafka.appender,
		db,
	});
	return { processor, kafka, fullReads };
};

describe("the offset a read covers, around a logged evict", () => {
	test("1.5 + 1.6 (R7, R8) between an evict's drop and its record a read re-hydrates below it; once logged, at it", async () => {
		const { processor, kafka, fullReads } = await createCommitterProcessor();
		await evictCustomer(processor);
		expect((await read(processor)).logOffset).toBe("0");
		const readsBefore = fullReads.length;

		const evictRecord = kafka.holdNextAppend();
		const evicted = evictCustomer(processor);
		await evictRecord.reached;
		const betweenDropAndRecord = await read(processor);
		expect(fullReads.length).toBe(readsBefore + 1);
		expect(betweenDropAndRecord.logOffset).toBe("0");

		evictRecord.release();
		await evicted;
		expect(kafka.appended.map((record) => record.command.type)).toEqual([
			"evict",
			"evict",
		]);
		expect((await read(processor)).logOffset).toBe("1");
	});
});

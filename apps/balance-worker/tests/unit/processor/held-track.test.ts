import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createSubjectState,
	type MeteringIdentity,
	parseTrackCommand,
} from "@autumn/balance-engine";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { CommittedOutcomeAppender } from "../../../src/processor/writer/types/partitionWriter.js";
import {
	MutationBatchAppendError,
	MutationBatchNotCommittedError,
	PartitionWriterRecoveryRequiredError,
} from "../../../src/processor/writer/writerErrors.js";
import { createCommitPositions } from "../../../src/runtime/commitPositions/createCommitPositions.js";
import type {
	CommitPositions,
	FailedPosition,
} from "../../../src/runtime/commitPositions/types/commitPositions.js";
import { openStateStore } from "../../../src/state/openStateStore.js";
import type { SqliteStateStore } from "../../../src/state/types/stateStore.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	createCustomerEntitlement,
	restoreSubjectStates,
	testOrg,
} from "../../fixtures/mutations.js";

const topic = "metering-events-v1";
const partition = 1;
const identity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};

function trackCommand({
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
function gatedAppender(): CommittedOutcomeAppender & {
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

function processorOn({
	positions,
	appender,
	store,
}: {
	positions: CommitPositions;
	appender: CommittedOutcomeAppender;
	store: SqliteStateStore & { storeGate?: () => Promise<void> };
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
			catalogCache: createTestCatalogCache(),
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

function openStore(): {
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
async function residentFixture() {
	const positions = createCommitPositions({ config: { partitionCount: 4 } });
	const appender = gatedAppender();
	const { store, close } = openStore();
	const processor = processorOn({ positions, appender, store });
	const warm = processor.track({
		command: trackCommand({ commandId: "warm" }),
	});
	await waitForAppend();
	appender.release();
	await warm;
	await processor.drain();
	return { positions, appender, store, processor, close };
}

async function waitForAppend(): Promise<void> {
	for (let turn = 0; turn < 3; turn++)
		await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("inline tracks with held replies", () => {
	test("an inline track is decided at once, its reply held at its sequence number until the log has it", async () => {
		const f = await residentFixture();
		const committed: number[] = [];
		f.positions.onCommitted(({ seq }) => committed.push(seq));
		try {
			const outcome = f.processor.trackInline({
				command: trackCommand({ commandId: "a", value: 3 }),
			});
			expect(outcome?.seq).toBe(2);
			expect(outcome?.reply?.result).toMatchObject({ type: "track" });
			expect(JSON.parse(outcome?.body ?? "{}")).toEqual(
				JSON.parse(JSON.stringify(outcome?.reply)),
			);
			expect(f.positions.readCommitPosition({ partition })).toBe(1);
			await waitForAppend();
			f.appender.release();
			await waitForAppend();
			expect(committed).toEqual([2]);
			expect(f.positions.readCommitPosition({ partition })).toBe(2);
		} finally {
			f.close();
		}
	});

	test("the held reply carries the same bytes the ordinary track answers with", async () => {
		const inline = await residentFixture();
		const classic = await residentFixture();
		try {
			const held = inline.processor.trackInline({
				command: trackCommand({ commandId: "same", value: 4 }),
			});
			const answered = classic.processor.track({
				command: trackCommand({ commandId: "same", value: 4 }),
			});
			await waitForAppend();
			classic.appender.release();
			expect(JSON.parse(held?.body ?? "{}")).toEqual(
				JSON.parse(JSON.stringify(await answered)),
			);
		} finally {
			inline.close();
			classic.close();
		}
	});

	test("a retry while the write is in flight gets the same reply and sequence number, and appends nothing", async () => {
		const f = await residentFixture();
		try {
			const first = f.processor.trackInline({
				command: trackCommand({ commandId: "r" }),
			});
			const retry = f.processor.trackInline({
				command: trackCommand({ commandId: "r" }),
			});
			expect(retry).toEqual({ body: first?.body ?? "", seq: first?.seq ?? -1 });
			await waitForAppend();
			f.appender.release();
			await waitForAppend();
			expect(f.appender.batches).toEqual([1, 1]);
			await f.processor.drain();
			const stored = f.processor.trackInline({
				command: trackCommand({ commandId: "r" }),
			});
			expect(stored?.seq).toBe(0);
			expect(JSON.parse(stored?.body ?? "{}").result).toEqual(
				JSON.parse(first?.body ?? "{}").result,
			);
		} finally {
			f.close();
		}
	});

	test("a customer with an ordinary write in flight takes the ordinary path, and an ordinary retry of a held write is answered at its commit", async () => {
		const f = await residentFixture();
		try {
			const ordinary = f.processor.track({
				command: trackCommand({ commandId: "o" }),
			});
			await waitForAppend();
			expect(
				f.processor.trackInline({ command: trackCommand({ commandId: "x" }) }),
			).toBeNull();
			f.appender.release();
			await ordinary;

			const held = f.processor.trackInline({
				command: trackCommand({ commandId: "h" }),
			});
			const joined = f.processor.track({
				command: trackCommand({ commandId: "h" }),
			});
			await waitForAppend();
			f.appender.release();
			expect(JSON.parse(JSON.stringify(await joined))).toEqual(
				JSON.parse(held?.body ?? "{}"),
			);
		} finally {
			f.close();
		}
	});

	test("a lock, or a customer whose rows are not resident, is handed to the ordinary path", async () => {
		const f = await residentFixture();
		try {
			expect(
				f.processor.trackInline({
					command: trackCommand({ commandId: "l", lock: true }),
				}),
			).toBeNull();
			expect(
				f.processor.trackInline({
					command: trackCommand({
						commandId: "e",
						who: { ...identity, entityId: "ent_1" },
					}),
				}),
			).toBeNull();
			expect(
				f.processor.trackInline({
					command: trackCommand({
						commandId: "c",
						who: { ...identity, customerId: "cus_cold" },
					}),
				}),
			).toBeNull();
			expect(f.appender.batches).toEqual([1]);
		} finally {
			f.close();
		}
	});

	test("a drain covers held writes: it settles only once the store has applied them", async () => {
		const f = await residentFixture();
		try {
			const applied = Promise.withResolvers<void>();
			f.store.storeGate = () => applied.promise;
			f.processor.trackInline({ command: trackCommand({ commandId: "s" }) });
			let stored = false;
			const waiting = f.processor.drain().then(() => {
				stored = true;
			});
			await waitForAppend();
			f.appender.release();
			await waitForAppend();
			expect(stored).toBe(false);
			applied.resolve();
			await waiting;
			expect(stored).toBe(true);
		} finally {
			f.close();
		}
	});

	test("a held write whose store apply fails makes the drain fail, as an ordinary write's does", async () => {
		for (const decideWith of ["inline", "ordinary"] as const) {
			const f = await residentFixture();
			try {
				f.store.storeGate = () => Promise.reject(new Error("store refused"));
				const command = trackCommand({ commandId: `apply_${decideWith}` });
				if (decideWith === "inline") f.processor.trackInline({ command });
				else void f.processor.track({ command });
				await waitForAppend();
				f.appender.release();
				await waitForAppend();
				const drained = await f.processor.drain().then(
					() => "resolved",
					(cause: unknown) => cause,
				);
				expect(drained).toBeInstanceOf(PartitionWriterRecoveryRequiredError);
			} finally {
				f.close();
			}
		}
	});

	test("a refused append fails the held write's range as not committed", async () => {
		const f = await residentFixture();
		const failed: FailedPosition[] = [];
		f.positions.onFailedAbove((position) => failed.push(position));
		try {
			f.processor.trackInline({ command: trackCommand({ commandId: "f" }) });
			await waitForAppend();
			f.appender.release({
				fail: new MutationBatchNotCommittedError({ cause: new Error("no") }),
			});
			await waitForAppend();
			expect(failed).toEqual([
				{
					partition,
					seq: 1,
					lastSeq: 2,
					cause: expect.any(MutationBatchAppendError),
				},
			]);
		} finally {
			f.close();
		}
	});
});

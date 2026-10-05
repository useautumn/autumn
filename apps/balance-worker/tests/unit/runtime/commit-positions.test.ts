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
	MutationBatchNotCommittedError,
	PartitionWriterDisposedError,
} from "../../../src/processor/writer/writerErrors.js";
import { createCommitPositions } from "../../../src/runtime/commitPositions/createCommitPositions.js";
import { CommitPositionsOverlapError } from "../../../src/runtime/commitPositions/errors.js";
import type {
	CommitPositions,
	FailedPosition,
} from "../../../src/runtime/commitPositions/types/commitPositions.js";
import { openStateStore } from "../../../src/state/openStateStore.js";
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
const partition = 2;
const identity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};

function trackCommand({ commandId }: { commandId: string }) {
	return parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			org: testOrg,
			commandId,
			requestId: `req_${commandId}`,
			identity,
			featureId: "messages",
			internalFeatureId: "feat_messages",
			value: 1,
			overageBehavior: "reject",
			properties: null,
			usageEvent: { name: "messages", idempotencyKey: null, id: null },
			occurredAt: 1_700_000_000_000,
		},
	});
}

function recordingAppender({
	failFirst,
}: {
	failFirst?: () => Error;
} = {}): CommittedOutcomeAppender & { batchSizes: number[] } {
	const batchSizes: number[] = [];
	let nextOffset = 0n;
	let failure = failFirst;
	return {
		batchSizes,
		async appendCommitted({ outcomes }) {
			const pending = failure;
			failure = undefined;
			if (pending) throw pending();
			batchSizes.push(outcomes.length);
			const baseOffset = nextOffset;
			nextOffset += BigInt(outcomes.length);
			return { baseOffset };
		},
	};
}

/** A partition processor whose writer publishes to `positions`, over a real state store. */
function processorOn({
	positions,
	appender,
}: {
	positions: CommitPositions;
	appender: CommittedOutcomeAppender;
}) {
	const directory = mkdtempSync(join(tmpdir(), "autumn-commit-positions-"));
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
						balance: 1_000,
					}),
				],
			}),
		],
	});
	const processor = createPartitionProcessor({
		ctx: {
			stateStore: store,
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
	function close(): void {
		store.close();
		rmSync(directory, { recursive: true, force: true });
	}
	return { processor, close };
}

function track({
	processor,
	commandId,
}: {
	processor: ReturnType<typeof processorOn>["processor"];
	commandId: string;
}) {
	return processor.track({ command: trackCommand({ commandId }) });
}

function failuresOf({ positions }: { positions: CommitPositions }) {
	const failed: FailedPosition[] = [];
	positions.onFailedAbove((position) => failed.push(position));
	return failed;
}

function failureCount({ positions }: { positions: CommitPositions }): number {
	return Atomics.load(new Int32Array(positions.failureCounts), partition);
}

describe("commit positions", () => {
	test("each committed batch moves the partition's cell to its last write, numbered in decide order", async () => {
		const positions = createCommitPositions({ config: { partitionCount: 4 } });
		const committed: number[] = [];
		positions.onCommitted(({ seq }) => committed.push(seq));
		const appender = recordingAppender();
		const { processor, close } = processorOn({ positions, appender });
		try {
			await Promise.all(
				["a", "b", "c"].map((commandId) => track({ processor, commandId })),
			);
			await track({ processor, commandId: "d" });
			expect(appender.batchSizes).toEqual([3, 1]);
			expect(committed).toEqual([3, 4]);
			expect(positions.readCommitPosition({ partition })).toBe(4);
			expect(
				Number(Atomics.load(new BigInt64Array(positions.cells), partition)),
			).toBe(4);
			expect(positions.readCommitPosition({ partition: 0 })).toBe(0);
		} finally {
			close();
		}
	});

	test("a definite append failure fails exactly the writes above the commit position, and moves no cell", async () => {
		const positions = createCommitPositions({ config: { partitionCount: 4 } });
		const failed = failuresOf({ positions });
		const appender = recordingAppender();
		const { processor, close } = processorOn({ positions, appender });
		try {
			await track({ processor, commandId: "a" });
			appender.appendCommitted = recordingAppender({
				failFirst: () =>
					new MutationBatchNotCommittedError({ cause: new Error("refused") }),
			}).appendCommitted;
			const refused = await Promise.allSettled([
				track({ processor, commandId: "b" }),
				track({ processor, commandId: "c" }),
			]);
			expect(refused.map(({ status }) => status)).toEqual([
				"rejected",
				"rejected",
			]);
			expect(failed).toEqual([
				{ partition, seq: 1, lastSeq: 3, cause: expect.any(Error) },
			]);
			expect(failureCount({ positions })).toBe(1);
			expect(positions.readCommitPosition({ partition })).toBe(1);
			processor.dispose();
			expect(failed).toHaveLength(1);
		} finally {
			close();
		}
	});

	test("an append that may have committed puts the writer in recovery and fails everything it issued past the position", async () => {
		const positions = createCommitPositions({ config: { partitionCount: 4 } });
		const failed = failuresOf({ positions });
		const { processor, close } = processorOn({
			positions,
			appender: recordingAppender({
				failFirst: () => new Error("acknowledgement lost"),
			}),
		});
		try {
			const lost = await Promise.allSettled([
				track({ processor, commandId: "a" }),
				track({ processor, commandId: "b" }),
			]);
			expect(lost.every(({ status }) => status === "rejected")).toBe(true);
			expect(failed).toEqual([
				{ partition, seq: 0, lastSeq: 2, cause: expect.any(Error) },
			]);
		} finally {
			close();
		}
	});

	test("a writer disposed mid-flight fails what it issued, its late acks are ignored, and the next writer numbers above it", async () => {
		const positions = createCommitPositions({ config: { partitionCount: 4 } });
		const failed = failuresOf({ positions });
		const committed: number[] = [];
		positions.onCommitted(({ seq }) => committed.push(seq));
		const stalled = Promise.withResolvers<{ baseOffset: bigint }>();
		const first = processorOn({
			positions,
			appender: { appendCommitted: () => stalled.promise },
		});
		try {
			const issued = [
				track({ processor: first.processor, commandId: "a" }),
				track({ processor: first.processor, commandId: "b" }),
			];
			await new Promise<void>((resolve) => setImmediate(resolve));
			first.processor.dispose();
			expect(failed).toEqual([
				{
					partition,
					seq: 0,
					lastSeq: 2,
					cause: expect.any(PartitionWriterDisposedError),
				},
			]);
			stalled.resolve({ baseOffset: 0n });
			await Promise.allSettled(issued);
			expect(committed).toEqual([]);
			expect(positions.readCommitPosition({ partition })).toBe(0);
			const next = processorOn({ positions, appender: recordingAppender() });
			try {
				await track({ processor: next.processor, commandId: "c" });
				expect(committed).toEqual([3]);
				next.processor.dispose();
				expect(failed).toHaveLength(1);
			} finally {
				next.close();
			}
		} finally {
			stalled.resolve({ baseOffset: 0n });
			first.close();
		}
	});

	test("a second writer cannot issue while the first has unconfirmed writes; once it may, the first is retired and its failures cover only its own", async () => {
		const positions = createCommitPositions({ config: { partitionCount: 4 } });
		const failed = failuresOf({ positions });
		const stalled = Promise.withResolvers<{ baseOffset: bigint }>();
		const first = processorOn({
			positions,
			appender: { appendCommitted: () => stalled.promise },
		});
		const second = processorOn({
			positions,
			appender: recordingAppender({
				failFirst: () =>
					new MutationBatchNotCommittedError({ cause: new Error("refused") }),
			}),
		});
		try {
			const inFlight = track({ processor: first.processor, commandId: "a" });
			await new Promise<void>((resolve) => setImmediate(resolve));
			const overlapping = await Promise.allSettled([
				track({ processor: second.processor, commandId: "b" }),
			]);
			expect(overlapping[0]).toMatchObject({
				status: "rejected",
				reason: expect.any(CommitPositionsOverlapError),
			});
			stalled.resolve({ baseOffset: 0n });
			await inFlight;
			expect(positions.readCommitPosition({ partition })).toBe(1);
			const refused = await Promise.allSettled([
				track({ processor: second.processor, commandId: "c" }),
			]);
			expect(refused[0]?.status).toBe("rejected");
			expect(failed).toEqual([
				{ partition, seq: 1, lastSeq: 2, cause: expect.any(Error) },
			]);
			const retired = await Promise.allSettled([
				track({ processor: first.processor, commandId: "d" }),
			]);
			expect(retired[0]).toMatchObject({
				status: "rejected",
				reason: expect.any(CommitPositionsOverlapError),
			});
		} finally {
			stalled.resolve({ baseOffset: 0n });
			first.close();
			second.close();
		}
	});

	test("a drained writer's disposal publishes no failure", async () => {
		const positions = createCommitPositions({ config: { partitionCount: 4 } });
		const failed = failuresOf({ positions });
		const { processor, close } = processorOn({
			positions,
			appender: recordingAppender(),
		});
		try {
			await track({ processor, commandId: "a" });
			processor.dispose();
			expect(failed).toEqual([]);
			expect(failureCount({ positions })).toBe(0);
		} finally {
			close();
		}
	});

	test("a cell only moves forward, and a closed writer's reports are ignored", () => {
		const positions = createCommitPositions({ config: { partitionCount: 4 } });
		const failed = failuresOf({ positions });
		const sink = positions.sinkFor({ partition });
		sink.committed({ seq: 5 });
		sink.committed({ seq: 3 });
		expect(positions.readCommitPosition({ partition })).toBe(5);
		sink.closed();
		sink.committed({ seq: 9 });
		sink.failedAbove({ seq: 5, lastSeq: 9, cause: new Error("late") });
		expect(positions.readCommitPosition({ partition })).toBe(5);
		expect(failed).toEqual([]);
		expect(failureCount({ positions })).toBe(0);
	});

	test("another thread reads a partition's commit position and failure count straight from shared memory", async () => {
		const positions = createCommitPositions({ config: { partitionCount: 4 } });
		const sink = positions.sinkFor({ partition });
		sink.nextSeq();
		sink.nextSeq();
		sink.committed({ seq: 2 });
		sink.failedAbove({ seq: 2, lastSeq: 5, cause: new Error("x") });
		const source = `self.onmessage = ({ data }) => {
			const cell = Atomics.load(new BigInt64Array(data.cells), data.partition);
			const failures = Atomics.load(new Int32Array(data.failureCounts), data.partition);
			self.postMessage({ cell: Number(cell), failures });
		};`;
		const url = URL.createObjectURL(new Blob([source]));
		const reader = new Worker(url);
		try {
			const answer = new Promise<{ cell: number; failures: number }>(
				(resolve) => {
					reader.onmessage = (event) => resolve(event.data);
				},
			);
			reader.postMessage({
				cells: positions.cells,
				failureCounts: positions.failureCounts,
				partition,
			});
			expect(await answer).toEqual({ cell: 2, failures: 1 });
		} finally {
			reader.terminate();
			URL.revokeObjectURL(url);
		}
	});

	test("a partition outside the task is refused", () => {
		const positions = createCommitPositions({ config: { partitionCount: 4 } });
		expect(() => positions.sinkFor({ partition: 4 })).toThrow(RangeError);
		expect(() => positions.readCommitPosition({ partition: -1 })).toThrow(
			RangeError,
		);
		expect(() =>
			createCommitPositions({ config: { partitionCount: 0 } }),
		).toThrow(RangeError);
	});
});

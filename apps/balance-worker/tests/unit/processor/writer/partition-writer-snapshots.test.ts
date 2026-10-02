import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	type SubjectState,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { SubjectSnapshotCustomer } from "@autumn/postgres";
import { createCommitterStateStore } from "../../../../src/committer/createCommitterStateStore.js";
import type {
	Committer,
	FlushOutcome,
} from "../../../../src/committer/types/committer.js";
import {
	defaultSubjectSnapshotsEdgeConfig,
	type SubjectSnapshotMode,
} from "../../../../src/edgeConfig/subjectSnapshotsEdgeConfig.js";
import { dropStaleSubject } from "../../../../src/processor/actions/dropStaleSubject.js";
import type { PartitionProcessorScope } from "../../../../src/processor/types/partitionProcessor.js";
import { createPartitionWriter } from "../../../../src/processor/writer/createPartitionWriter.js";
import { createRecentCommands } from "../../../../src/processor/writer/recentCommands/createRecentCommands.js";
import { createSubjectMapBudget } from "../../../../src/processor/writer/subjectMap/createSubjectMapBudget.js";
import type { MutateParams } from "../../../../src/processor/writer/types/mutation.js";
import type { DurableMutationRecord } from "../../../../src/state/types/durableMutation.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
} from "../../../fixtures/mutations.js";

const topic = "writer-snapshots";
const partition = 2;
const READ_AT = 1_699_000_000_000;
const identity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};
const customerKey = meteringIdentityToPartitionKey({ identity });

const decideTrack = ({
	state,
	command,
}: MutateParams & { command: TrackCommand }) => {
	if (!state) throw new Error("Expected resident state");
	const mutation = computeTrack({
		fullSubject: createSubjectFor({ state }),
		command,
	});
	return {
		kind: "write" as const,
		mutation,
		nextState: applyMutation({ state, mutation }),
	};
};

/** The production writer over the committer's store; the committer stand-in records what each flush carried. */
const createHarness = async ({
	mode = "write",
	subjectMapBytes,
}: {
	mode?: SubjectSnapshotMode;
	/** A bound small enough that the next subject read whole evicts the last unpinned one. */
	subjectMapBytes?: number;
} = {}) => {
	const settings = { ...defaultSubjectSnapshotsEdgeConfig(), mode };
	const applied: DurableMutationRecord[][] = [];
	const drops: SubjectSnapshotCustomer[][] = [];
	const events: string[] = [];
	const gates = {
		apply: Promise.resolve() as Promise<void>,
		drop: Promise.resolve() as Promise<void>,
	};
	let dropFailure: Error | null = null;
	let rejectNext: string | null = null;
	const committer: Committer = {
		apply: async ({ records, expectedOffset, snapshotDrops }) => {
			if (snapshotDrops) {
				events.push("drop");
				await gates.drop;
				if (dropFailure) throw dropFailure;
				drops.push([...snapshotDrops]);
				events.push("dropped");
				return { nextOffset: expectedOffset };
			}
			events.push("apply");
			await gates.apply;
			applied.push([...records]);
			const outcome: FlushOutcome = {
				nextOffset:
					(records.at(-1)?.position.offset ?? expectedOffset - 1n) + 1n,
			};
			const rejected = records.find(
				(record) => record.mutation.id === rejectNext,
			);
			if (rejected)
				outcome.rejections = [
					{ record: rejected, cause: new Error("refused") },
				];
			return outcome;
		},
		drain: async () => undefined,
		stop: () => undefined,
	};
	const stateStore = createCommitterStateStore({
		ctx: {
			committer,
			db: {
				readPartitionProgress: async () => null,
				insertPartitionProgress: async () => undefined,
				claimPartitionProgress: async () => undefined,
			},
		},
		config: { subjectSnapshots: { read: () => settings } },
	});
	await stateStore.initializePartition({ topic, partition, nextOffset: 0n });
	let nextOffset = 0n;
	const appendGate = { held: Promise.resolve() as Promise<void> };
	const writer = createPartitionWriter({
		ctx: {
			stateStore,
			appender: {
				appendCommitted: async ({ outcomes }) => {
					await appendGate.held;
					const baseOffset = nextOffset;
					nextOffset += BigInt(outcomes.length);
					return { baseOffset };
				},
			},
			receiptPolicy: { retentionMs: 86_400_000, now: () => READ_AT },
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
		},
		config: {
			topic,
			partition,
			limits: {
				maxBatchSize: 100,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 100,
				...(subjectMapBytes && {
					subjectMapBudget: createSubjectMapBudget({
						totalBytes: subjectMapBytes,
					}),
				}),
			},
		},
	});
	const track = (commandId: string) =>
		writer.decide({
			command: createTrackCommand({ identity, value: 1, commandId }),
			mutate: ({ state }) =>
				decideTrack({
					state,
					command: createTrackCommand({ identity, value: 1, commandId }),
				}),
		});
	return {
		writer,
		applied,
		drops,
		events,
		gates,
		appendGate,
		track,
		failDrops: (error: Error) => {
			dropFailure = error;
		},
		rejectCommand: (commandId: string) => {
			rejectNext = commandId;
		},
		setMode: (next: SubjectSnapshotMode) => {
			settings.mode = next;
		},
	};
};

const readWhole = ({
	writer,
	baselineAt = READ_AT,
	balance = 100,
	identity: read = identity,
}: {
	writer: Awaited<ReturnType<typeof createHarness>>["writer"];
	baselineAt?: number;
	balance?: number;
	identity?: MeteringIdentity;
}): SubjectState =>
	writer.adopt({
		state: createState({ identity: read, balance }),
		baselineAt,
	});

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("partition writer subject snapshots", () => {
	test("mode off attaches nothing to the records it hands the store", async () => {
		const harness = await createHarness({ mode: "off" });
		readWhole({ writer: harness.writer });

		await harness.track("t1").waitForStore();

		expect(harness.applied).toHaveLength(1);
		expect(harness.applied[0]?.[0]).not.toHaveProperty("snapshots");
	});

	test("the control is read per decision: a flip to write takes effect at the next full read, a flip to off at the next record and evict", async () => {
		const harness = await createHarness({ mode: "off" });
		readWhole({ writer: harness.writer });
		await harness.track("t1").waitForStore();
		expect(harness.applied[0]?.[0]).not.toHaveProperty("snapshots");

		harness.setMode("write");
		// The rows were read whole under off and every record since is stored, so they can be written as they stand.
		await harness.track("t2").waitForStore();
		expect(harness.applied[1]?.[0]?.snapshots).toHaveLength(1);
		await harness.writer.evict({ customerKey });
		expect(harness.drops).toHaveLength(1);

		harness.setMode("off");
		readWhole({ writer: harness.writer });
		await harness.track("t3").waitForStore();
		expect(harness.applied[2]?.[0]).not.toHaveProperty("snapshots");
		await harness.writer.evict({ customerKey });
		expect(harness.drops).toHaveLength(1);
	});

	test("a subject stays resident until Postgres holds its record, so a drop for space can never make the next read stale", async () => {
		const harness = await createHarness({ subjectMapBytes: 1 });
		const other: MeteringIdentity = { ...identity, customerId: "cus_other" };
		readWhole({ writer: harness.writer });
		const applyHeld = Promise.withResolvers<void>();
		harness.gates.apply = applyHeld.promise;
		const first = harness.track("t1");
		await first.waitForCommit();
		// t1 is appended but not stored; a read of another subject tries to drop it for space.
		readWhole({ writer: harness.writer, balance: 1, identity: other });
		expect(harness.writer.readFreshestState({ identity })).not.toBeNull();

		applyHeld.resolve();
		await first.waitForStore();
		// Stored: the next subject read whole drops it, and a read whole now sees Postgres with t1.
		readWhole({
			writer: harness.writer,
			balance: 1,
			identity: { ...identity, customerId: "cus_third" },
		});
		expect(harness.writer.readFreshestState({ identity })).toBeNull();

		readWhole({ writer: harness.writer, balance: 99 });
		await harness.track("t2").waitForStore();
		expect(
			harness.applied[1]?.[0]?.snapshots?.[0]?.state.customerEntitlements[0]
				?.balance,
		).toBe(98);
	});

	test("a record on a subject read whole carries the state it leaves, and when that read happened", async () => {
		const harness = await createHarness();
		readWhole({ writer: harness.writer, baselineAt: 1_234 });

		await harness.track("t1").waitForStore();

		const [record] = harness.applied[0] ?? [];
		expect(record?.snapshots).toEqual([
			{
				state: harness.writer.readFreshestState({ identity }) as SubjectState,
				baselineAt: 1_234,
			},
		]);
	});

	test("the baseline carries forward through every flush; only a new full read moves it", async () => {
		const harness = await createHarness();
		readWhole({ writer: harness.writer, baselineAt: 1_234 });
		await harness.track("t1").waitForStore();
		await harness.track("t2").waitForStore();

		expect(
			harness.applied.flat().map((record) => record.snapshots?.[0]?.baselineAt),
		).toEqual([1_234, 1_234]);
	});

	test("a subject that was never read whole carries nothing, so its customer is deleted rather than written", async () => {
		const harness = await createHarness();
		harness.writer.adopt({ state: createState({ identity, balance: 100 }) });

		await harness.track("t1").waitForStore();

		expect(harness.applied[0]?.[0]?.snapshots).toBeUndefined();
	});

	test("a record the store refused disowns the customer's rows: a record decided on them meanwhile carries nothing, the next read whole does", async () => {
		const harness = await createHarness();
		readWhole({ writer: harness.writer });
		const held = Promise.withResolvers<void>();
		harness.gates.apply = held.promise;
		harness.rejectCommand("t1");

		await harness.track("t1").waitForCommit();
		await tick();
		const second = harness.track("t2");
		await second.waitForCommit();
		held.resolve();
		await second.waitForStore();

		expect(harness.applied.map((flush) => flush.length)).toEqual([1, 1]);
		expect(harness.applied[1]?.[0]?.snapshots).toBeUndefined();

		expect(harness.writer.readFreshestState({ identity })).toBeNull();
		readWhole({ writer: harness.writer });
		await harness.track("t3").waitForStore();
		expect(harness.applied[2]?.[0]?.snapshots).toHaveLength(1);
	});

	test("an evict disowns the rows before it awaits: a record decided before it lands ahead of the DELETE, one decided meanwhile carries nothing", async () => {
		const harness = await createHarness();
		readWhole({ writer: harness.writer });
		const appendHeld = Promise.withResolvers<void>();
		harness.appendGate.held = appendHeld.promise;
		const before = harness.track("t1");
		await tick();

		const evicted = harness.writer.evict({ customerKey });
		const meanwhile = harness.track("t2");

		appendHeld.resolve();
		await before.waitForStore();
		await meanwhile.waitForStore();
		await evicted;

		expect(harness.applied[0]?.[0]?.snapshots).toHaveLength(1);
		expect(harness.applied[1]?.[0]?.snapshots).toBeUndefined();
		expect(harness.events).toEqual(["apply", "drop", "dropped", "apply"]);
		expect(harness.drops).toEqual([
			[{ orgId: "org_1", env: "sandbox", customerId: "cus_1" }],
		]);
	});

	test("the evict resolves only once its DELETE has committed", async () => {
		const harness = await createHarness();
		readWhole({ writer: harness.writer });
		const dropHeld = Promise.withResolvers<void>();
		harness.gates.drop = dropHeld.promise;

		let settled = false;
		const evicted = harness.writer.evict({ customerKey }).then(() => {
			settled = true;
		});
		await tick();
		await tick();
		expect(harness.events).toEqual(["drop"]);
		expect(settled).toBe(false);

		dropHeld.resolve();
		await evicted;
	});

	test("a failed DELETE fails the evict, so the caller retries it", async () => {
		const harness = await createHarness();
		readWhole({ writer: harness.writer });
		harness.failDrops(new Error("relation subject_snapshots does not exist"));

		await expect(harness.writer.evict({ customerKey })).rejects.toThrow(
			"subject_snapshots does not exist",
		);
	});

	test("a deferred drop hands its DELETE to the caller and returns once the rows are gone from memory", async () => {
		const harness = await createHarness();
		readWhole({ writer: harness.writer });
		const dropHeld = Promise.withResolvers<void>();
		harness.gates.drop = dropHeld.promise;
		const deferred: Promise<void>[] = [];

		await harness.writer.evict({
			customerKey,
			deferSnapshotDrop: (dropped) => deferred.push(dropped),
		});

		expect(harness.writer.readFreshestState({ identity })).toBeNull();
		expect(deferred).toHaveLength(1);
		dropHeld.resolve();
		await Promise.all(deferred);
	});

	test("after an evict, the next record carries the state of the new full read", async () => {
		const harness = await createHarness();
		readWhole({ writer: harness.writer, baselineAt: 1 });
		await harness.writer.evict({ customerKey });
		readWhole({ writer: harness.writer, baselineAt: 2 });

		await harness.track("t1").waitForStore();

		expect(harness.applied[0]?.[0]?.snapshots?.[0]?.baselineAt).toBe(2);
	});

	test("a full read while the DELETE is in flight carries state again: its record lands after the DELETE on the lane", async () => {
		const harness = await createHarness();
		readWhole({ writer: harness.writer });
		const dropHeld = Promise.withResolvers<void>();
		harness.gates.drop = dropHeld.promise;
		const evicted = harness.writer.evict({ customerKey });
		await tick();
		readWhole({ writer: harness.writer, baselineAt: 2 });
		const tracked = harness.track("fresh_1");
		await tracked.waitForCommit();
		dropHeld.resolve();
		await evicted;
		await tracked.waitForStore();
		expect(harness.events).toEqual(["drop", "dropped", "apply"]);
		expect(harness.applied[0]?.[0]?.snapshots?.[0]?.baselineAt).toBe(2);
	});

	test("a track is answered while an evict's DELETE is still in flight: the request path never waits on a snapshot", async () => {
		const harness = await createHarness();
		readWhole({ writer: harness.writer });
		const dropHeld = Promise.withResolvers<void>();
		harness.gates.drop = dropHeld.promise;
		const evicted = harness.writer.evict({ customerKey });
		await tick();
		readWhole({ writer: harness.writer });

		const reply = await Promise.race([
			harness
				.track("t1")
				.waitForCommit()
				.then(() => "answered"),
			Bun.sleep(200).then(() => "waited"),
		]);

		expect(reply).toBe("answered");
		expect(harness.events).toEqual(["drop"]);
		dropHeld.resolve();
		await evicted;
	});

	test("dropStaleSubject overtakes in-flight loads synchronously, before anything awaits", async () => {
		const harness = await createHarness();
		readWhole({ writer: harness.writer });
		const overtaken: string[] = [];
		const scope = {
			ctx: {
				writer: harness.writer,
				subjectHydrator: {
					overtakeInFlightLoads: ({ customerKey }: { customerKey: string }) =>
						overtaken.push(customerKey),
				},
			},
		} as unknown as PartitionProcessorScope;

		const dropped = dropStaleSubject({ scope, identity });

		expect(overtaken).toEqual([customerKey]);
		await dropped;
		expect(harness.drops).toHaveLength(1);
	});
});

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createSubjectState,
	type MeteringIdentity,
	parseTrackCommand,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import {
	COMMIT_DEPTH_EXPERIMENT,
	commitPipelineDepthOf,
} from "../../../../src/experiments/commitDepth.js";
import { createCustomerPlans } from "../../../../src/processor/commands/applyBillingPlan/customerPlans/customerPlans.js";
import { track } from "../../../../src/processor/commands/track.js";
import { createAcceptedCommands } from "../../../../src/processor/common/acceptedCommands.js";
import { createSubjectHydrator } from "../../../../src/processor/subject/createSubjectHydrator.js";
import { createSubjectDecisions } from "../../../../src/processor/subject/subjectDecisions/createSubjectDecisions.js";
import type { PartitionProcessorScope } from "../../../../src/processor/types/partitionProcessor.js";
import { createPartitionWriter } from "../../../../src/processor/writer/createPartitionWriter.js";
import { createRecentCommands } from "../../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type {
	CommittedOutcomeAppender,
	PartitionWriterLimits,
} from "../../../../src/processor/writer/types/partitionWriter.js";
import {
	MutationBatchAppendError,
	MutationBatchNotCommittedError,
	PartitionWriterRecoveryRequiredError,
} from "../../../../src/processor/writer/writerErrors.js";
import { OwnedPartitionLogDivergedError } from "../../../../src/runtime/runtimeErrors.js";
import { openStateStore } from "../../../../src/state/openStateStore.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../../fixtures/catalog.js";
import {
	createCustomerEntitlement,
	restoreSubjectStates,
	testOrg,
} from "../../../fixtures/mutations.js";
import {
	clearStagingArms,
	forceStagingArm,
} from "../../../fixtures/stagingArms.js";

const topic = "metering-events-v1";
const partition = 0;
const identity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};

const createCommand = ({ commandId }: { commandId: string }): TrackCommand =>
	parseTrackCommand({
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

/** Every append stays open until the test answers it, in whatever order the test likes. */
class HeldAppender implements CommittedOutcomeAppender {
	readonly batches: MeteringRecord[][] = [];
	private readonly pending: (
		| ((result: { baseOffset: bigint } | Error) => void)
		| undefined
	)[] = [];

	appendCommitted({
		outcomes,
	}: {
		topic: string;
		partition: number;
		outcomes: readonly MeteringRecord[];
	}): Promise<{ baseOffset: bigint }> {
		this.batches.push([...outcomes]);
		return new Promise((resolve, reject) => {
			this.pending.push((result) =>
				result instanceof Error ? reject(result) : resolve(result),
			);
		});
	}

	inFlight(): number {
		return this.pending.filter(Boolean).length;
	}

	answer({ index, baseOffset }: { index: number; baseOffset: bigint }): void {
		this.take({ index })({ baseOffset });
	}

	fail({ index, error }: { index: number; error: Error }): void {
		this.take({ index })(error);
	}

	private take({ index }: { index: number }) {
		const settle = this.pending[index];
		if (!settle) throw new Error(`No append ${index} in flight`);
		this.pending[index] = undefined;
		return settle;
	}
}

const turns = async (count = 4): Promise<void> => {
	for (let turn = 0; turn < count; turn += 1)
		await new Promise<void>((resolve) => setImmediate(resolve));
};

const createHarness = ({ limits }: { limits: PartitionWriterLimits }) => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-commit-depth-"));
	const stateStore = openStateStore({
		databasePath: join(directory, "balance-state.sqlite"),
	});
	stateStore.initializePartition({ topic, partition, nextOffset: 0n });
	restoreSubjectStates({
		store: stateStore,
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
	const appender = new HeldAppender();
	const receiptPolicy = {
		retentionMs: 86_400_000,
		now: () => 1_700_000_000_000,
	};
	const recentCommands = createRecentCommands({
		windowMs: 600_000,
		now: () => 0,
	});
	const writer = createPartitionWriter({
		ctx: { stateStore, appender, receiptPolicy, recentCommands },
		config: { topic, partition, limits },
	});
	const db = createSyntheticWorkerDb();
	const catalogCache = createTestCatalogCache();
	const scope: PartitionProcessorScope = {
		ctx: {
			stateStore,
			appender,
			db,
			catalogCache,
			receiptPolicy,
			recentCommands,
			assertCanRead: () => undefined,
			config: { topic, partition, writerLimits: limits },
			writer,
			subjectDecisions: createSubjectDecisions(),
			subjectHydrator: createSubjectHydrator({
				ctx: { catalogCache, db, writer, receiptPolicy },
			}),
		},
		accepted: createAcceptedCommands(),
		customerPlans: createCustomerPlans(),
	};
	return {
		appender,
		writer,
		submit: (commandId: string) =>
			track({ scope, command: createCommand({ commandId }) }),
		close: () => {
			stateStore.close();
			rmSync(directory, { recursive: true, force: true });
		},
	};
};

/** One record per append so every submitted track is its own batch on the wire. */
const limits: PartitionWriterLimits = {
	maxBatchSize: 1,
	maxPendingCommands: 1_000,
	maxPendingCommandsPerCustomer: 100,
	commitPipelineDepth: 3,
};

afterEach(() => clearStagingArms());

describe("commit-depth arms", () => {
	test("A keeps one append in flight even where a depth is configured", () => {
		forceStagingArm({ experiment: COMMIT_DEPTH_EXPERIMENT, arm: "A" });
		expect(commitPipelineDepthOf({ limits })).toBe(1);
	});

	test("B runs the configured depth; a depth of one or none stays stop-and-wait under either arm", () => {
		forceStagingArm({ experiment: COMMIT_DEPTH_EXPERIMENT, arm: "B" });
		expect(commitPipelineDepthOf({ limits })).toBe(3);
		expect(commitPipelineDepthOf({ limits: { commitPipelineDepth: 1 } })).toBe(
			1,
		);
		expect(commitPipelineDepthOf({ limits: {} })).toBe(1);
	});
});

describe("commit pipeline (arm B)", () => {
	test("keeps several appends in flight and settles callers in log order even when the broker answers out of order", async () => {
		forceStagingArm({ experiment: COMMIT_DEPTH_EXPERIMENT, arm: "B" });
		const harness = createHarness({ limits });
		try {
			const settled: string[] = [];
			const replies = ["t_1", "t_2", "t_3"].map((commandId) =>
				harness.submit(commandId).then(() => settled.push(commandId)),
			);
			await turns();
			expect(harness.appender.batches.map((batch) => batch.length)).toEqual([
				1, 1, 1,
			]);
			expect(harness.appender.inFlight()).toBe(3);

			harness.appender.answer({ index: 2, baseOffset: 2n });
			harness.appender.answer({ index: 1, baseOffset: 1n });
			await turns();
			// Nothing settles ahead of the oldest append.
			expect(settled).toEqual([]);

			harness.appender.answer({ index: 0, baseOffset: 0n });
			await Promise.all(replies);
			expect(settled).toEqual(["t_1", "t_2", "t_3"]);
			await harness.writer.waitForApplies();
			expect(harness.writer.readFreshestState({ identity })).not.toBeNull();
		} finally {
			harness.close();
		}
	});

	test("a refused head takes the whole pipe to recovery: later batches were decided on its state", async () => {
		forceStagingArm({ experiment: COMMIT_DEPTH_EXPERIMENT, arm: "B" });
		const harness = createHarness({ limits });
		try {
			const replies = ["t_1", "t_2", "t_3"].map((commandId) =>
				harness.submit(commandId),
			);
			await turns();
			expect(harness.appender.inFlight()).toBe(3);

			harness.appender.fail({
				index: 0,
				error: new MutationBatchNotCommittedError({
					cause: new Error("refused"),
				}),
			});
			const outcomes = await Promise.allSettled(replies);
			for (const outcome of outcomes) {
				expect(outcome.status).toBe("rejected");
				if (outcome.status !== "rejected") throw new Error("unreachable");
				expect(outcome.reason).toBeInstanceOf(
					PartitionWriterRecoveryRequiredError,
				);
			}
			expect(() => harness.writer.assertCommitsHealthy()).toThrow(
				PartitionWriterRecoveryRequiredError,
			);
		} finally {
			harness.close();
		}
	});

	test("a successor's fence between two in-flight appends: the diverged one and everything behind it are refused, never acknowledged", async () => {
		forceStagingArm({ experiment: COMMIT_DEPTH_EXPERIMENT, arm: "B" });
		const harness = createHarness({ limits });
		try {
			const settled: string[] = [];
			const replies = ["t_1", "t_2", "t_3"].map((commandId) =>
				harness
					.submit(commandId)
					.then(() => settled.push(commandId))
					.catch((cause) => cause),
			);
			await turns();
			expect(harness.appender.inFlight()).toBe(3);

			// The first append landed where it should; the second landed past a record that is not ours.
			harness.appender.answer({ index: 0, baseOffset: 0n });
			harness.appender.fail({
				index: 1,
				error: new OwnedPartitionLogDivergedError({
					topic,
					partition,
					expectedOffset: 1n,
					actualOffset: 2n,
				}),
			});
			const outcomes = await Promise.all(replies);
			expect(settled).toEqual(["t_1"]);
			expect(outcomes[1]).toBeInstanceOf(PartitionWriterRecoveryRequiredError);
			expect(outcomes[2]).toBeInstanceOf(PartitionWriterRecoveryRequiredError);
			expect(() => harness.writer.assertCommitsHealthy()).toThrow(
				PartitionWriterRecoveryRequiredError,
			);
		} finally {
			harness.close();
		}
	});

	test("a refused batch alone in the pipe still rejects only itself, as today", async () => {
		forceStagingArm({ experiment: COMMIT_DEPTH_EXPERIMENT, arm: "B" });
		const harness = createHarness({ limits });
		try {
			const first = harness.submit("t_1").catch((cause) => cause);
			await turns();
			expect(harness.appender.inFlight()).toBe(1);
			harness.appender.fail({
				index: 0,
				error: new MutationBatchNotCommittedError({
					cause: new Error("refused"),
				}),
			});
			expect(await first).toBeInstanceOf(MutationBatchAppendError);
			harness.writer.assertCommitsHealthy();

			const second = harness.submit("t_2");
			await turns();
			harness.appender.answer({ index: 1, baseOffset: 0n });
			await second;
		} finally {
			harness.close();
		}
	});
});

describe("commit pipeline (arm A)", () => {
	test("waits for each append before sending the next", async () => {
		forceStagingArm({ experiment: COMMIT_DEPTH_EXPERIMENT, arm: "A" });
		const harness = createHarness({ limits });
		try {
			const replies = ["t_1", "t_2"].map((commandId) =>
				harness.submit(commandId),
			);
			await turns();
			expect(harness.appender.inFlight()).toBe(1);
			harness.appender.answer({ index: 0, baseOffset: 0n });
			await turns();
			expect(harness.appender.inFlight()).toBe(1);
			harness.appender.answer({ index: 1, baseOffset: 1n });
			await Promise.all(replies);
		} finally {
			harness.close();
		}
	});
});

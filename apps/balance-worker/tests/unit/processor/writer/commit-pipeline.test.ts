import { describe, expect, test } from "bun:test";
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
	MutationBatchNotCommittedError,
	PartitionWriterRecoveryRequiredError,
} from "../../../../src/processor/writer/writerErrors.js";
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
	private readonly pending: ((
		result: { baseOffset: bigint } | Error,
	) => void)[] = [];

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
		const settle = this.pending[index];
		if (!settle) throw new Error(`No append ${index} in flight`);
		delete this.pending[index];
		settle({ baseOffset });
	}

	refuse({ index }: { index: number }): void {
		const settle = this.pending[index];
		if (!settle) throw new Error(`No append ${index} in flight`);
		delete this.pending[index];
		settle(new MutationBatchNotCommittedError({ cause: new Error("refused") }));
	}
}

const turns = async (count = 4): Promise<void> => {
	for (let turn = 0; turn < count; turn += 1)
		await new Promise<void>((resolve) => setImmediate(resolve));
};

const createHarness = ({ limits }: { limits: PartitionWriterLimits }) => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-commit-pipeline-"));
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

const limits: PartitionWriterLimits = {
	maxBatchSize: 1,
	maxPendingCommands: 1_000,
	maxPendingCommandsPerCustomer: 100,
	commitPipelineDepth: 3,
};

describe("commit pipeline", () => {
	test("keeps several appends in flight and settles callers in log order even when the broker answers out of order", async () => {
		const harness = createHarness({ limits });
		try {
			const settled: string[] = [];
			const replies = ["t_1", "t_2", "t_3"].map((commandId) =>
				harness.submit(commandId).then(() => settled.push(commandId)),
			);
			await turns();
			// maxBatchSize 1 and depth 3: three single-record appends are on the wire at once.
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
		const harness = createHarness({ limits });
		try {
			const replies = ["t_1", "t_2", "t_3"].map((commandId) =>
				harness.submit(commandId),
			);
			await turns();
			expect(harness.appender.inFlight()).toBe(3);

			harness.appender.refuse({ index: 0 });
			const outcomes = await Promise.allSettled(replies);
			expect(outcomes.map((outcome) => outcome.status)).toEqual([
				"rejected",
				"rejected",
				"rejected",
			]);
			for (const outcome of outcomes) {
				if (outcome.status !== "rejected")
					throw new Error("expected rejection");
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

	test("depth 1 is the stop-and-wait loop of today", async () => {
		const harness = createHarness({
			limits: { ...limits, commitPipelineDepth: 1 },
		});
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

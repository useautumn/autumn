import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { adopt as adoptState } from "./actions/adopt.js";
import {
	failAboveSettled,
	flushDeferredLogs as flushDeferred,
} from "./actions/commit.js";
import {
	decide as decideMutation,
	readFreshestState as readFreshestSubjectState,
	waitForPendingCommits as waitForCustomerCommits,
} from "./actions/decide.js";
import {
	decideHeld as decideHeldMutation,
	decideHeldGroup as decideHeldMutationGroup,
	heldBlockerOf,
	waitForHeldCommit as waitForHeldMutationCommit,
} from "./actions/decideHeld.js";
import { evict as evictCustomer } from "./actions/evict.js";
import { evictResident as evictResidentSubjects } from "./actions/evictResident.js";
import { log as logMutation } from "./actions/log.js";
import { createSlowDecideReporter } from "./createSlowDecideReporter.js";
import {
	allStored,
	awaitStored,
	createPartitionWriterState,
	rejectAllPending,
	snapshotAllStored,
} from "./pendingMutations.js";
import type { OnSubjectEvicted } from "./subjectMap/types/subjectMap.js";
import type {
	DecidedMutation,
	HeldDecision,
	HeldSubmission,
	MutationSubmission,
} from "./types/mutation.js";
import type {
	PartitionWriter,
	PartitionWriterConfig,
	PartitionWriterContext,
	PartitionWriterScope,
} from "./types/partitionWriter.js";
import { PartitionWriterDisposedError } from "./writerErrors.js";

export function createPartitionWriter({
	ctx,
	config,
}: {
	ctx: PartitionWriterContext;
	config: PartitionWriterConfig;
}): PartitionWriter {
	validateWriterConfig(config);
	const budgetShare = config.limits.subjectMapBudget?.join({
		sizeBytes: () => scope.state.subjects.sizeBytes(),
	});
	const scope: PartitionWriterScope = {
		ctx,
		config,
		state: createPartitionWriterState({
			subjectMapMaxBytes: budgetShare
				? () => budgetShare.maxBytes()
				: undefined,
			onEvicted: evictDeleteOf({ ctx, config }),
		}),
	};

	const slowDecides = createSlowDecideReporter({
		ctx: {
			logger: ctx.logger,
			now: ctx.now ?? (() => performance.now()),
			stateBytesOf: ({ subjectKey }) =>
				scope.state.subjects.bytesOf({ subjectKey }),
			pendingCommands: () => scope.state.queue.length,
		},
		config: { topic: config.topic, partition: config.partition },
	});

	function dispose(): void {
		budgetShare?.leave();
		// Terminal: an ack landing after this settles no caller as committed, so callers and the sink agree.
		const error = new PartitionWriterDisposedError();
		scope.state.recoveryError ??= error;
		rejectAllPending({
			state: scope.state,
			batch: scope.state.unapplied.flatMap((unapplied) => unapplied.batch),
			error,
		});
		failAboveSettled({ scope, cause: error });
		ctx.commitPositions?.closed();
	}

	function decide<Reply>(
		submission: MutationSubmission<Reply>,
	): DecidedMutation<Reply> {
		return slowDecides.measure({
			command: submission.command,
			run: () =>
				timeSync({ label: "writer.decide" }, () =>
					decideMutation({ scope, submission }),
				),
		});
	}

	function decideHeld<Reply>(
		submission: HeldSubmission<Reply>,
	): HeldDecision<Reply> | null {
		return slowDecides.measure({
			command: submission.command,
			run: () =>
				timeSync({ label: "writer.decide" }, () =>
					decideHeldMutation({ scope, submission }),
				),
		});
	}

	function decideHeldGroup<Result>(
		params: Parameters<PartitionWriter["decideHeldGroup"]>[0] & {
			decide: () => Result;
		},
	) {
		return decideHeldMutationGroup({ scope, ...params });
	}

	function waitForHeldCommit(
		params: Parameters<PartitionWriter["waitForHeldCommit"]>[0],
	) {
		return waitForHeldMutationCommit({ scope, ...params });
	}

	function heldBlocker(params: Parameters<PartitionWriter["heldBlocker"]>[0]) {
		return heldBlockerOf({ scope, ...params });
	}

	function log(params: Parameters<PartitionWriter["log"]>[0]): Promise<void> {
		return logMutation({ scope, ...params });
	}

	function flushDeferredLogs(): Promise<void> {
		return flushDeferred({ scope });
	}

	function waitForPendingCommits({
		customerKey,
	}: {
		customerKey: string;
	}): Promise<void> {
		return waitForCustomerCommits({ scope, customerKey });
	}

	function assertCommitsHealthy(): void {
		if (scope.state.recoveryError) throw scope.state.recoveryError;
	}

	function readFreshestState({
		identity,
	}: Parameters<PartitionWriter["readFreshestState"]>[0]) {
		return readFreshestSubjectState({ scope, identity });
	}

	function evict({ customerKey }: Parameters<PartitionWriter["evict"]>[0]) {
		return evictCustomer({ scope, customerKey });
	}

	function evictResident({
		coldStart,
	}: Parameters<PartitionWriter["evictResident"]>[0]) {
		return evictResidentSubjects({ scope, coldStart });
	}

	function adopt(params: Parameters<PartitionWriter["adopt"]>[0]) {
		return adoptState({ scope, ...params });
	}

	function waitForStore() {
		return allStored({ state: scope.state });
	}

	function snapshotStore() {
		return snapshotAllStored({ state: scope.state });
	}

	/** The append in flight and every batch handed to the store so far, applied or failed; never rejects. */
	async function waitForApplies(): Promise<void> {
		// A waiter on everything handed out keeps the apply from lingering while the partition drains.
		awaitStored({ state: scope.state, seq: scope.state.lastSeq }).catch(
			() => undefined,
		);
		await scope.state.appending;
		await scope.state.applyTail.catch(() => undefined);
	}

	return {
		waitForStore,
		snapshotStore,
		waitForApplies,
		decide,
		decideHeld,
		decideHeldGroup,
		heldBlocker,
		waitForHeldCommit,
		log,
		flushDeferredLogs,
		waitForPendingCommits,
		assertCommitsHealthy,
		readFreshestState,
		evict,
		evictResident,
		adopt,
		dispose,
	};
}

function validateWriterConfig(config: PartitionWriterConfig): void {
	if (config.topic.trim().length === 0)
		throw new Error("Kafka topic cannot be empty");
	if (!Number.isSafeInteger(config.partition) || config.partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${config.partition}`);
	}
	for (const [name, value] of Object.entries(config.limits)) {
		if (value === undefined || typeof value !== "number") continue;
		if (!Number.isSafeInteger(value) || value <= 0) {
			throw new RangeError(`${name} must be a positive safe integer`);
		}
	}
}

/** The map's evict hook: a synchronous enqueue onto the partition's lane, never awaited by a request. */
function evictDeleteOf({
	ctx,
	config,
}: {
	ctx: PartitionWriterContext;
	config: PartitionWriterConfig;
}): OnSubjectEvicted | undefined {
	const writes = ctx.stateStore.snapshotQueues;
	if (!writes) return undefined;
	return ({ customerKey }) =>
		writes.enqueueDelete({
			topic: config.topic,
			partition: config.partition,
			customerKey,
		});
}

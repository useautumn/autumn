import { heapSize } from "bun:jsc";
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
import { evict as evictCustomer } from "./actions/evict.js";
import { log as logMutation } from "./actions/log.js";
import { createSlowDecideReporter } from "./createSlowDecideReporter.js";
import { createPartitionWriterState } from "./pendingMutations.js";
import type { DecidedMutation, MutationSubmission } from "./types/mutation.js";
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
		}),
	};

	const slowDecides = createSlowDecideReporter({
		ctx: {
			logger: ctx.logger,
			now: ctx.now ?? (() => performance.now()),
			heapSize: ctx.heapSize ?? heapSize,
			stateBytesOf: ({ subjectKey }) =>
				scope.state.subjects.bytesOf({ subjectKey }),
			pendingCommands: () => scope.state.queue.length,
		},
		config: { topic: config.topic, partition: config.partition },
	});

	function dispose(): void {
		budgetShare?.leave();
		scope.state.subjects.clear();
		// A drained writer owes nothing; one disposed mid-flight still owes its issued writes an answer.
		failAboveSettled({ scope, cause: new PartitionWriterDisposedError() });
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

	function adopt({ state }: Parameters<PartitionWriter["adopt"]>[0]) {
		return adoptState({ scope, state });
	}

	function waitForStore() {
		return scope.state.storeCompletion;
	}

	/** Every batch handed to the store so far, applied or failed; never rejects. */
	function waitForApplies(): Promise<void> {
		return scope.state.applyTail.catch(() => undefined);
	}

	return {
		waitForStore,
		waitForApplies,
		decide,
		log,
		flushDeferredLogs,
		waitForPendingCommits,
		assertCommitsHealthy,
		readFreshestState,
		evict,
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

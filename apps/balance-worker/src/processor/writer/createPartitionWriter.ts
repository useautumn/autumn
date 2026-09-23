import { adopt as adoptState } from "./actions/adopt.js";
import {
	decide as decideMutation,
	readFreshestState as readFreshestSubjectState,
	waitForPendingCommits as waitForCustomerCommits,
} from "./actions/decide.js";
import { evict as evictCustomer } from "./actions/evict.js";
import { createPartitionWriterState } from "./pendingMutations.js";
import type { DecidedMutation, MutationSubmission } from "./types/mutation.js";
import type {
	PartitionWriter,
	PartitionWriterConfig,
	PartitionWriterContext,
	PartitionWriterScope,
} from "./types/partitionWriter.js";

export function createPartitionWriter({
	ctx,
	config,
}: {
	ctx: PartitionWriterContext;
	config: PartitionWriterConfig;
}): PartitionWriter {
	validateWriterConfig(config);
	const scope: PartitionWriterScope = {
		ctx,
		config,
		state: createPartitionWriterState(),
	};

	function decide<Reply>(
		submission: MutationSubmission<Reply>,
	): DecidedMutation<Reply> {
		return decideMutation({ scope, submission });
	}

	function waitForPendingCommits({
		customerKey,
	}: {
		customerKey: string;
	}): Promise<void> {
		return waitForCustomerCommits({ scope, customerKey });
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
		waitForPendingCommits,
		readFreshestState,
		evict,
		adopt,
	};
}

function validateWriterConfig(config: PartitionWriterConfig): void {
	if (config.topic.trim().length === 0)
		throw new Error("Kafka topic cannot be empty");
	if (!Number.isSafeInteger(config.partition) || config.partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${config.partition}`);
	}
	for (const [name, value] of Object.entries(config.limits)) {
		if (value === undefined) continue;
		if (!Number.isSafeInteger(value) || value <= 0) {
			throw new RangeError(`${name} must be a positive safe integer`);
		}
	}
}

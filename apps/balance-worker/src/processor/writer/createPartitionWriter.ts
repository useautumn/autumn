import type { StateInitializedEvent } from "@autumn/balance-engine";
import {
	decide as decideOutcome,
	submitInitialization as submitInitializationToPartition,
	waitForPendingCommits as waitForCustomerCommits,
} from "./actions/decide.js";
import { createPartitionWriterState } from "./pendingOutcomes.js";
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
		return decideOutcome({ scope, submission });
	}

	function waitForPendingCommits({
		customerKey,
	}: {
		customerKey: string;
	}): Promise<void> {
		return waitForCustomerCommits({ scope, customerKey });
	}

	// Async wrapper so every failure surfaces as a rejection; the action never awaits.
	async function submitInitialization({
		initialization,
	}: {
		initialization: StateInitializedEvent;
	}) {
		return submitInitializationToPartition({ scope, initialization });
	}

	return { decide, waitForPendingCommits, submitInitialization };
}

function validateWriterConfig(config: PartitionWriterConfig): void {
	if (config.topic.trim().length === 0)
		throw new Error("Kafka topic cannot be empty");
	if (!Number.isSafeInteger(config.partition) || config.partition < 0) {
		throw new RangeError(`Invalid Kafka partition: ${config.partition}`);
	}
	for (const [name, value] of Object.entries(config.limits)) {
		if (!Number.isSafeInteger(value) || value <= 0) {
			throw new RangeError(`${name} must be a positive safe integer`);
		}
	}
}

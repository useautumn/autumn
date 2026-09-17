import { meteringPartitionKeyOf } from "@autumn/balance-engine";
import {
	decide as decideMutation,
	readFreshestState as readFreshestCustomerState,
	waitForPendingCommits as waitForCustomerCommits,
} from "./actions/decide.js";
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
		return readFreshestCustomerState({
			scope,
			customerKey: meteringPartitionKeyOf({ identity }),
			identity,
		});
	}

	return { decide, waitForPendingCommits, readFreshestState };
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

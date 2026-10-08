import { LIBRDKAFKA_ERROR_CODES } from "@autumn/librdkafka";
import {
	emitConsumerEvent,
	emitGroupChange,
	memberAssignmentOf,
} from "./consumerEvents.js";
import type {
	NativeConsumer,
	NativeKafkaError,
	NativeTopicPartition,
} from "./types/nativeConsumer.js";
import {
	type ConsumerRunnerScope,
	partitionKeyOf,
} from "./types/runnerState.js";

function bumpGeneration({
	scope,
	key,
}: {
	scope: ConsumerRunnerScope;
	key: string;
}): void {
	const { generation } = scope.state;
	generation.set(key, (generation.get(key) ?? 0) + 1);
}

function forgetPartition({
	scope,
	key,
}: {
	scope: ConsumerRunnerScope;
	key: string;
}): void {
	const { state } = scope;
	state.assigned.delete(key);
	state.paused.delete(key);
	state.skippedFrom.delete(key);
	state.pendingSeeks.delete(key);
	bumpGeneration({ scope, key });
}

/** The caller hears the change first, so seeks and pauses it asks for land with the assignment itself. */
function assignPartitions({
	scope,
	native,
	partitions,
	cooperative,
}: {
	scope: ConsumerRunnerScope;
	native: NativeConsumer;
	partitions: NativeTopicPartition[];
	cooperative: boolean;
}): void {
	const { state } = scope;
	if (!cooperative) {
		for (const key of [...state.assigned.keys()])
			forgetPartition({ scope, key });
	}
	const added: string[] = [];
	for (const { topic, partition } of partitions) {
		const key = partitionKeyOf({ topic, partition });
		state.assigned.set(key, { topic, partition });
		state.assigning.add(key);
		added.push(key);
	}
	if (cooperative) emitGroupChange({ scope });
	else if (!state.leaving)
		emitConsumerEvent({
			scope,
			type: "consumer.group_join",
			payload: {
				groupId: scope.config.groupId,
				memberAssignment: memberAssignmentOf({ scope }),
			},
		});
	const assignments: (NativeTopicPartition & { offset?: number })[] = [];
	for (const { topic, partition } of partitions) {
		const offset = state.pendingSeeks.get(partitionKeyOf({ topic, partition }));
		assignments.push(
			offset === undefined
				? { topic, partition }
				: { topic, partition, offset },
		);
	}
	for (const key of added) {
		state.pendingSeeks.delete(key);
		state.assigning.delete(key);
	}
	if (cooperative) native.incrementalAssign(assignments);
	else native.assign(assignments);
	const paused: NativeTopicPartition[] = [];
	for (const assigned of partitions)
		if (state.paused.has(partitionKeyOf(assigned))) paused.push(assigned);
	if (paused.length > 0) native.pause(paused);
}

function revokePartitions({
	scope,
	native,
	partitions,
	cooperative,
}: {
	scope: ConsumerRunnerScope;
	native: NativeConsumer;
	partitions: NativeTopicPartition[];
	cooperative: boolean;
}): void {
	const revoked = cooperative ? partitions : [...scope.state.assigned.values()];
	for (const partition of revoked)
		forgetPartition({ scope, key: partitionKeyOf(partition) });
	if (cooperative) {
		native.incrementalUnassign(partitions);
		emitGroupChange({ scope });
		return;
	}
	native.unassign();
	if (!scope.state.leaving)
		emitConsumerEvent({
			scope,
			type: "consumer.rebalancing",
			payload: { groupId: scope.config.groupId },
		});
}

export function handleRebalance({
	scope,
	native,
	error,
	partitions,
}: {
	scope: ConsumerRunnerScope;
	native: NativeConsumer;
	error: NativeKafkaError;
	partitions: NativeTopicPartition[];
}): void {
	const cooperative = native.rebalanceProtocol() === "COOPERATIVE";
	try {
		if (error.code === LIBRDKAFKA_ERROR_CODES.ERR__ASSIGN_PARTITIONS)
			assignPartitions({ scope, native, partitions, cooperative });
		else revokePartitions({ scope, native, partitions, cooperative });
	} catch (cause) {
		scope.log("error", "Kafka consumer could not apply a rebalance", {
			error: String(cause),
			code: error.code,
		});
	}
}

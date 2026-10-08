import type {
	ConsumerEventByName,
	ConsumerEventName,
} from "../../types/kafkaWire.js";
import type { ConsumerRunnerScope } from "./types/runnerState.js";

type PayloadOf<Name extends ConsumerEventName> =
	ConsumerEventByName[Name]["payload"];

/** Listeners run synchronously; one that throws is logged and never stops the consumer. */
export function emitConsumerEvent<Name extends ConsumerEventName>({
	scope,
	type,
	payload,
}: {
	scope: ConsumerRunnerScope;
	type: Name;
	payload: PayloadOf<Name>;
}): void {
	const event = {
		type,
		timestamp: Date.now(),
		payload,
	} as ConsumerEventByName[Name];
	const listeners = scope.state.listeners[type] as Set<
		(event: ConsumerEventByName[Name]) => void
	>;
	for (const listener of [...listeners]) {
		try {
			listener(event);
		} catch (cause) {
			scope.log("error", `Kafka consumer listener for ${type} threw`, {
				error: String(cause),
			});
		}
	}
}

/** The full current assignment, per topic, sorted: what kafkajs's GROUP_JOIN carried. */
export function memberAssignmentOf({
	scope,
}: {
	scope: ConsumerRunnerScope;
}): Record<string, number[]> {
	const byTopic: Record<string, number[]> = {};
	for (const { topic, partition } of scope.state.assigned.values()) {
		const partitions = byTopic[topic] ?? [];
		partitions.push(partition);
		byTopic[topic] = partitions;
	}
	for (const partitions of Object.values(byTopic)) partitions.sort(byPartition);
	return byTopic;
}

function byPartition(left: number, right: number): number {
	return left - right;
}

/** A group change as kafkajs reported every one: everything revoked, then the whole new assignment. */
export function emitGroupChange({
	scope,
}: {
	scope: ConsumerRunnerScope;
}): void {
	if (scope.state.leaving) return;
	const groupId = scope.config.groupId;
	emitConsumerEvent({
		scope,
		type: "consumer.rebalancing",
		payload: { groupId },
	});
	emitConsumerEvent({
		scope,
		type: "consumer.group_join",
		payload: { groupId, memberAssignment: memberAssignmentOf({ scope }) },
	});
}

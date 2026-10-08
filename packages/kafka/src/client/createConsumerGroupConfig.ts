import { assertPositiveSafeInteger } from "../lib/assert.js";
import type { KafkaConsumerGroupTimings } from "./types/kafkaLimits.js";
import type { ConsumerConfig } from "./types/kafkaWire.js";

export const TAIL_FETCH_MAX_WAIT_MS = 5_000;

export function assertConsumerGroupTimings({
	timings,
}: {
	timings: KafkaConsumerGroupTimings;
}): void {
	assertPositiveSafeInteger({
		name: "fetchMaxWaitTimeMs",
		value: timings.fetchMaxWaitTimeMs,
	});
	assertPositiveSafeInteger({
		name: "heartbeatIntervalMs",
		value: timings.heartbeatIntervalMs,
	});
	assertPositiveSafeInteger({
		name: "rebalanceTimeoutMs",
		value: timings.rebalanceTimeoutMs,
	});
	assertPositiveSafeInteger({
		name: "sessionTimeoutMs",
		value: timings.sessionTimeoutMs,
	});
	if (timings.heartbeatIntervalMs >= timings.sessionTimeoutMs) {
		throw new RangeError(
			"heartbeatIntervalMs must be lower than sessionTimeoutMs",
		);
	}
	if (timings.sessionTimeoutMs > timings.rebalanceTimeoutMs) {
		throw new RangeError("sessionTimeoutMs cannot exceed rebalanceTimeoutMs");
	}
}

/** A group's config; it speaks KIP-848 unless asked otherwise, where the broker owns heartbeats and sessions. */
export function createConsumerGroupConfig({
	groupId,
	timings,
	remoteAssignor,
}: {
	groupId: string;
	timings: KafkaConsumerGroupTimings;
	remoteAssignor?: ConsumerConfig["remoteAssignor"];
}): ConsumerConfig {
	if (groupId.trim().length === 0) throw new Error("groupId cannot be empty");
	assertConsumerGroupTimings({ timings });
	return {
		groupId,
		groupProtocol: "consumer",
		...(remoteAssignor && { remoteAssignor }),
		readUncommitted: false,
		allowAutoTopicCreation: false,
		maxWaitTimeInMs: timings.fetchMaxWaitTimeMs,
		heartbeatInterval: timings.heartbeatIntervalMs,
		rebalanceTimeout: timings.rebalanceTimeoutMs,
		sessionTimeout: timings.sessionTimeoutMs,
	};
}

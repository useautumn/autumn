import type { ConsumerConfig } from "kafkajs";
import { assertPositiveSafeInteger } from "../lib/assert.js";
import type { KafkaConsumerGroupTimings } from "./types/kafkaLimits.js";

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

export function createConsumerGroupConfig({
	groupId,
	timings,
}: {
	groupId: string;
	timings: KafkaConsumerGroupTimings;
}): ConsumerConfig {
	if (groupId.trim().length === 0) throw new Error("groupId cannot be empty");
	assertConsumerGroupTimings({ timings });
	return {
		groupId,
		readUncommitted: false,
		allowAutoTopicCreation: false,
		maxWaitTimeInMs: timings.fetchMaxWaitTimeMs,
		heartbeatInterval: timings.heartbeatIntervalMs,
		rebalanceTimeout: timings.rebalanceTimeoutMs,
		sessionTimeout: timings.sessionTimeoutMs,
	};
}

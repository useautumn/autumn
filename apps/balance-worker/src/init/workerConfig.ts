import {
	assertConsumerGroupTimings,
	createConsumerGroupConfig,
} from "@autumn/kafka";
import type { ConsumerConfig } from "kafkajs";
import type { KafkaBalanceWorkerTimings } from "./types/partitionRuntimeFactory.js";

export function assertKafkaBalanceWorkerTimings({
	timings,
}: {
	timings: KafkaBalanceWorkerTimings;
}): void {
	assertConsumerGroupTimings({ timings });
	if (
		!Number.isSafeInteger(timings.recoveryDrainTimeoutMs) ||
		timings.recoveryDrainTimeoutMs <= 0
	) {
		throw new RangeError(
			"recoveryDrainTimeoutMs must be a positive safe integer",
		);
	}
	if (
		timings.rebalanceTimeoutMs - timings.recoveryDrainTimeoutMs <
		timings.heartbeatIntervalMs
	) {
		throw new RangeError(
			"recoveryDrainTimeoutMs must leave at least one heartbeatIntervalMs before rebalanceTimeoutMs",
		);
	}
}
export function createWorkerConsumerConfig({
	groupId,
	timings,
}: {
	groupId: string;
	timings: KafkaBalanceWorkerTimings;
}): ConsumerConfig {
	assertKafkaBalanceWorkerTimings({ timings });
	return createConsumerGroupConfig({ groupId, timings });
}

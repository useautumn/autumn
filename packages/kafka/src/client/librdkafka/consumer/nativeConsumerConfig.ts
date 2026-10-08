import type { ConsumerConfig } from "../../types/kafkaWire.js";

/**
 * librdkafka heartbeats from its own thread, so a member stuck in a batch stays in the group until this long
 * passes without a poll; it is the rebalance timeout too (KIP-848), the window kafkajs gave a stuck member.
 */
export const DEFAULT_MAX_POLL_INTERVAL_MS = 300_000;
const DEFAULT_FETCH_MAX_WAIT_MS = 500;
/**
 * librdkafka learns a partition reached its end only from a fetch response, so an idle fetch's wait is how
 * late a catch-up hears it passed a trailing transaction marker; kafkajs saw markers in the batch itself.
 */
export const MAX_FETCH_WAIT_MS = 500;

/** librdkafka consumer properties for a kafkajs-shaped consumer config. */
export function nativeConsumerConfigOf({
	config,
}: {
	config: ConsumerConfig;
}): Record<string, unknown> {
	const protocol = config.groupProtocol ?? "consumer";
	const pollInterval = config.rebalanceTimeout ?? DEFAULT_MAX_POLL_INTERVAL_MS;
	const membership =
		protocol === "consumer"
			? {
					"group.protocol": "consumer",
					...(config.remoteAssignor && {
						"group.remote.assignor": config.remoteAssignor,
					}),
				}
			: {
					"group.protocol": "classic",
					"partition.assignment.strategy": "range",
					...(config.sessionTimeout && {
						"session.timeout.ms": config.sessionTimeout,
					}),
					...(config.heartbeatInterval && {
						"heartbeat.interval.ms": config.heartbeatInterval,
					}),
				};
	return {
		"group.id": config.groupId,
		...membership,
		"max.poll.interval.ms": pollInterval,
		"isolation.level": config.readUncommitted
			? "read_uncommitted"
			: "read_committed",
		"enable.auto.commit": false,
		"enable.auto.offset.store": false,
		"enable.partition.eof": true,
		"fetch.wait.max.ms": Math.min(
			config.maxWaitTimeInMs ?? DEFAULT_FETCH_MAX_WAIT_MS,
			MAX_FETCH_WAIT_MS,
		),
		"allow.auto.create.topics": config.allowAutoTopicCreation ?? false,
	};
}

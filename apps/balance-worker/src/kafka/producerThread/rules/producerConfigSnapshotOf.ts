import type { ProducerConfig } from "@autumn/kafka";
import type { ProducerConfigSnapshot } from "../types/producerThreadMessages.js";

/** Only plain fields cross threads; librdkafka honours a record's named partition without a partitioner. */
export function producerConfigSnapshotOf({
	config,
}: {
	config: ProducerConfig;
}): ProducerConfigSnapshot {
	const snapshot: ProducerConfigSnapshot = {};
	if (config.transactionalId !== undefined)
		snapshot.transactionalId = config.transactionalId;
	if (config.idempotent !== undefined) snapshot.idempotent = config.idempotent;
	if (config.maxInFlightRequests !== undefined)
		snapshot.maxInFlightRequests = config.maxInFlightRequests;
	if (config.transactionTimeout !== undefined)
		snapshot.transactionTimeout = config.transactionTimeout;
	if (config.allowAutoTopicCreation !== undefined)
		snapshot.allowAutoTopicCreation = config.allowAutoTopicCreation;
	if (config.retry !== undefined) snapshot.retry = { ...config.retry };
	if (config.compression !== undefined)
		snapshot.compression = config.compression;
	if (config.lingerMs !== undefined) snapshot.lingerMs = config.lingerMs;
	return snapshot;
}

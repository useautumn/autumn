import type { ProducerConfig } from "kafkajs";
import type { ProducerConfigSnapshot } from "../types/producerThreadMessages.js";

/** A partitioner is a function and cannot cross threads; the thread adds the explicit one back. */
export function producerConfigSnapshotOf({
	config,
}: {
	config: ProducerConfig;
}): ProducerConfigSnapshot {
	const { createPartitioner, ...rest } = config;
	return {
		...rest,
		explicitPartitioner: typeof createPartitioner === "function",
	};
}

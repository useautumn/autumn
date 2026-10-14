import type { ProducerConfig } from "kafkajs";
import type { ProducerConfigSnapshot } from "../types/producerThreadMessages.js";

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

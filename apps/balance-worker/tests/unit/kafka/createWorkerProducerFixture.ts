import {
	createProducerSession,
	type KafkaProducerClient,
	type KafkaProducerSession,
} from "@autumn/kafka";
import {
	createWorkerProducer,
	createWorkerProducerConfig,
} from "../../../src/kafka/createWorkerProducer.js";

export function createWorkerProducerFixture({
	producer,
	topic,
	partition,
}: {
	producer: KafkaProducerClient;
	topic: string;
	partition: number;
}): KafkaProducerSession {
	function createProducer(): KafkaProducerClient {
		return producer;
	}

	const session = createProducerSession({
		ctx: { kafka: { producer: createProducer } },
		config: createWorkerProducerConfig({
			deploymentEnvironment: "test",
			topic,
			partition,
			limits: {
				transactionTimeoutMs: 15_000,
				retryCount: 3,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 2_000,
			},
		}),
	});
	return createWorkerProducer({
		ctx: { session },
		config: { topic, partition },
	});
}

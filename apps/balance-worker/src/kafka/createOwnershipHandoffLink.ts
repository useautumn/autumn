import {
	createIdempotentProducerConfig,
	createOwnershipTail,
	type KafkaIdempotentProducerLimits,
	type KafkaSender,
	type OwnershipTail,
	type OwnershipTailKafka,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { Kafka } from "kafkajs";

/** What a worker shares across its partitions for handoffs: one ownership tail and one plain producer for `ready`. */
export type OwnershipHandoffLink = {
	start(): Promise<void>;
	stop(): Promise<void>;
	tail: Pick<OwnershipTail, "tailPartition">;
	sender: KafkaSender;
};

export function createOwnershipHandoffLink({
	ctx,
	config,
}: {
	ctx: {
		kafka: Pick<Kafka, "producer"> & OwnershipTailKafka;
		logger?: Pick<AutumnLogger, "warn">;
	};
	config: { topic: string; producerLimits: KafkaIdempotentProducerLimits };
}): OwnershipHandoffLink {
	const sender = ctx.kafka.producer(
		createIdempotentProducerConfig({ limits: config.producerLimits }),
	);
	function onError({ cause }: { cause: unknown }): void {
		ctx.logger?.warn("Ownership tail reported an error", { error: cause });
	}
	const tail = createOwnershipTail({
		ctx: { kafka: ctx.kafka, onError },
		config: { topic: config.topic },
	});

	async function start(): Promise<void> {
		await sender.connect();
		await tail.start();
	}

	async function stop(): Promise<void> {
		try {
			await tail.stop();
		} finally {
			await sender.disconnect();
		}
	}

	return { start, stop, tail, sender };
}

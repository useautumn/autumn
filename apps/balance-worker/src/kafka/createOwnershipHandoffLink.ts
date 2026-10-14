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

export type OwnershipHandoffLink = {
	start(): Promise<void>;
	stop(): Promise<void>;
	tail: Pick<OwnershipTail, "tailPartition" | "readView">;
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
	// Kafka IAM role already grants for ownership-log readers. Under the tail's
	const tail = createOwnershipTail({
		ctx: { kafka: ctx.kafka, onError },
		config: { topic: config.topic, groupIdPrefix: "autumn-ownership-log" },
	});

	async function start(): Promise<void> {
		await sender.connect();
		try {
			await tail.start();
		} catch (cause) {
			await sender.disconnect();
			throw cause;
		}
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

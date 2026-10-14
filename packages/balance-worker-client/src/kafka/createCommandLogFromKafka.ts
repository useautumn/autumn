import {
	type CommandAppend,
	createCommandPublisher,
	createIdempotentProducerConfig,
} from "@autumn/kafka";
import type { CommandLog } from "../queue/types/queue.js";
import type { BalanceWorkerKafka } from "./types/kafkaBalanceWorkerClient.js";

export type CommandLogFromKafka = CommandLog & {
	connect(): Promise<void>;
	stop(): Promise<void>;
};

export function createCommandLogFromKafka({
	ctx,
	config,
}: {
	ctx: { kafka: BalanceWorkerKafka };
	config: { topic: string };
}): CommandLogFromKafka {
	const producer = ctx.kafka.producer(
		createIdempotentProducerConfig({
			limits: { retryCount: 3, initialRetryTimeMs: 100, maxRetryTimeMs: 1_000 },
		}),
	);
	const publisher = createCommandPublisher({
		ctx: { producer, topic: config.topic },
	});
	let connecting: Promise<void> | undefined;

	async function connect(): Promise<void> {
		connecting ??= producer.connect();
		try {
			await connecting;
		} catch (cause) {
			connecting = undefined;
			throw cause;
		}
	}

	async function append(params: CommandAppend): Promise<void> {
		await connect();
		await publisher.append(params);
	}

	async function stop(): Promise<void> {
		if (!connecting) return;
		await producer.disconnect();
	}

	return { connect, append, stop };
}

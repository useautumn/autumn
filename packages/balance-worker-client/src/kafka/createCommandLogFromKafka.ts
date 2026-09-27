import {
	type CommandAppend,
	createCommandPublisher,
	createIdempotentProducerConfig,
} from "@autumn/kafka";
import type { CommandLog } from "../queue/types/queue.js";
import type { BalanceWorkerKafka } from "./types/kafkaBalanceWorkerClient.js";

export type CommandLogFromKafka = CommandLog & {
	/** Pays the producer connect now, so the first append does not. */
	connect(): Promise<void>;
	stop(): Promise<void>;
};

/** Connects on the first append, never before: a process that queues nothing owns no producer. */
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

	/** A failed connect is forgotten so the next append tries again. */
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

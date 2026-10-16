import {
	createIdempotentProducerConfig,
	type MigrationMessage,
} from "@autumn/kafka";
import { CompressionTypes } from "kafkajs";
import type { MigrationLog } from "../migrations/types/migrationLog.js";
import type { BalanceWorkerKafka } from "./types/kafkaBalanceWorkerClient.js";

export type MigrationLogFromKafka = MigrationLog & {
	stop(): Promise<void>;
};

export function createMigrationLogFromKafka({
	ctx,
	config,
}: {
	ctx: { kafka: BalanceWorkerKafka };
	config: { topic: string };
}): MigrationLogFromKafka {
	const producer = ctx.kafka.producer(
		createIdempotentProducerConfig({
			limits: { retryCount: 3, initialRetryTimeMs: 100, maxRetryTimeMs: 1_000 },
		}),
	);
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

	async function append({
		messages,
	}: {
		messages: readonly MigrationMessage[];
	}): Promise<void> {
		if (messages.length === 0) return;
		await connect();
		await producer.send({
			topic: config.topic,
			messages: [...messages],
			acks: -1,
			compression: CompressionTypes.GZIP,
		});
	}

	async function stop(): Promise<void> {
		if (!connecting) return;
		await producer.disconnect();
	}

	return { append, stop };
}

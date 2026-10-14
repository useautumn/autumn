import {
	createCatalogInvalidationPublisher,
	createIdempotentProducerConfig,
} from "@autumn/kafka";
import type {
	CatalogInvalidationParams,
	CatalogInvalidations,
} from "../catalog/types/catalogInvalidations.js";
import type { BalanceWorkerKafka } from "./types/kafkaBalanceWorkerClient.js";

export type CatalogInvalidationsFromKafka = CatalogInvalidations & {
	connect(): Promise<void>;
	stop(): Promise<void>;
};

export function createCatalogInvalidationsFromKafka({
	ctx,
	config,
}: {
	ctx: { kafka: BalanceWorkerKafka };
	config: { topic: string };
}): CatalogInvalidationsFromKafka {
	const producer = ctx.kafka.producer(
		createIdempotentProducerConfig({
			limits: { retryCount: 3, initialRetryTimeMs: 100, maxRetryTimeMs: 1_000 },
		}),
	);
	const publisher = createCatalogInvalidationPublisher({
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

	async function invalidateOrgCatalog({
		orgId,
		env,
	}: CatalogInvalidationParams): Promise<void> {
		await connect();
		await publisher.publish({ orgId, env, at: Date.now() });
	}

	async function stop(): Promise<void> {
		if (!connecting) return;
		await producer.disconnect();
	}

	return { connect, invalidateOrgCatalog, stop };
}

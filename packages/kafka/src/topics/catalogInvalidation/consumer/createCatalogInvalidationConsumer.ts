import { createConsumerGroupConfig } from "../../../client/createConsumerGroupConfig.js";
import { parseCatalogInvalidationRecord } from "../catalogInvalidationTopic.js";
import type {
	CatalogInvalidationConsumer,
	CatalogInvalidationConsumerConfig,
	CatalogInvalidationHandler,
	CatalogInvalidationKafka,
} from "./types/catalogInvalidationConsumer.js";

/** Nothing waits to take this group's partition over, so a long session is cheap and a rebalance never happens. */
const CONSUMER_TIMINGS = {
	fetchMaxWaitTimeMs: 250,
	heartbeatIntervalMs: 3_000,
	sessionTimeoutMs: 60_000,
	rebalanceTimeoutMs: 90_000,
};

/**
 * Reads catalog invalidations from now on under a group of its own, so every process sees every one.
 * A record from before the process started is nothing to it: a fresh cache holds nothing stale.
 */
export function createCatalogInvalidationConsumer({
	ctx,
	config,
}: {
	ctx: { kafka: CatalogInvalidationKafka; handler: CatalogInvalidationHandler };
	config: CatalogInvalidationConsumerConfig;
}): CatalogInvalidationConsumer {
	const groupId = `${config.groupIdPrefix}-${crypto.randomUUID()}`;
	const consumer = ctx.kafka.consumer(
		createConsumerGroupConfig({ groupId, timings: CONSUMER_TIMINGS }),
	);

	async function eachMessage({
		message,
	}: {
		message: { offset: string; key: Buffer | null; value: Buffer | null };
	}): Promise<void> {
		try {
			const record = parseCatalogInvalidationRecord({
				key: message.key,
				value: message.value,
			});
			await ctx.handler.apply({ record });
		} catch (cause) {
			ctx.handler.skip({ cause, offset: message.offset });
		}
	}

	async function start(): Promise<void> {
		await consumer.connect();
		await consumer.subscribe({ topics: [config.topic], fromBeginning: false });
		await consumer.run({ eachMessage });
	}

	async function stop(): Promise<void> {
		await consumer.disconnect();
	}

	return { start, stop };
}

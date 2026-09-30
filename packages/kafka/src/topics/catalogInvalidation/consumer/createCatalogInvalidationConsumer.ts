import { createConsumerGroupConfig } from "../../../client/createConsumerGroupConfig.js";
import { parseCatalogInvalidationRecord } from "../catalogInvalidationTopic.js";
import type {
	CatalogInvalidationConsumer,
	CatalogInvalidationConsumerConfig,
	CatalogInvalidationGroup,
	CatalogInvalidationHandler,
	CatalogInvalidationKafka,
} from "./types/catalogInvalidationConsumer.js";

/** A long session is cheap: a per-process group has no one to hand its partition to, and a shared one only delays a takeover. */
const CONSUMER_TIMINGS = {
	fetchMaxWaitTimeMs: 250,
	heartbeatIntervalMs: 3_000,
	sessionTimeoutMs: 60_000,
	rebalanceTimeoutMs: 90_000,
};

const groupIdOf = ({ group }: { group: CatalogInvalidationGroup }): string =>
	group.kind === "shared"
		? group.id
		: `${group.idPrefix}-${crypto.randomUUID()}`;

/**
 * Reads catalog invalidations in log order. A group with no position yet starts from now:
 * a per-process group always does, a shared group only the first time it ever runs.
 */
export function createCatalogInvalidationConsumer({
	ctx,
	config,
}: {
	ctx: { kafka: CatalogInvalidationKafka; handler: CatalogInvalidationHandler };
	config: CatalogInvalidationConsumerConfig;
}): CatalogInvalidationConsumer {
	const groupId = groupIdOf({ group: config.group });
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

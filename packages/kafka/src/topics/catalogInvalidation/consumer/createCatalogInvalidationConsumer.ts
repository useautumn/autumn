import {
	createConsumerGroupConfig,
	TAIL_FETCH_MAX_WAIT_MS,
} from "../../../client/createConsumerGroupConfig.js";
import { parseKafkaOffset } from "../../../client/kafkaOffsetUtils.js";
import { parseCatalogInvalidationRecord } from "../catalogInvalidationTopic.js";
import type {
	CatalogInvalidationConsumer,
	CatalogInvalidationConsumerConfig,
	CatalogInvalidationGroup,
	CatalogInvalidationHandler,
	CatalogInvalidationKafka,
} from "./types/catalogInvalidationConsumer.js";

const CONSUMER_TIMINGS = {
	fetchMaxWaitTimeMs: TAIL_FETCH_MAX_WAIT_MS,
	heartbeatIntervalMs: 3_000,
	sessionTimeoutMs: 60_000,
	rebalanceTimeoutMs: 90_000,
};

function groupIdOf({ group }: { group: CatalogInvalidationGroup }): string {
	return group.kind === "shared"
		? group.id
		: `${group.idPrefix}-${crypto.randomUUID()}`;
}

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
	const isPerProcess = config.group.kind === "perProcess";
	const nextOffsets = new Map<number, bigint>();
	let removeGroupJoinListener: (() => void) | undefined;

	async function eachMessage({
		partition,
		message,
	}: {
		partition: number;
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
		nextOffsets.set(
			partition,
			parseKafkaOffset({ offset: message.offset }) + 1n,
		);
	}

	function resumeFromReadOffsets(): void {
		for (const [partition, nextOffset] of nextOffsets)
			consumer.seek({
				topic: config.topic,
				partition,
				offset: nextOffset.toString(),
			});
	}

	async function start(): Promise<void> {
		await consumer.connect();
		if (isPerProcess)
			removeGroupJoinListener = consumer.on(
				consumer.events.GROUP_JOIN,
				resumeFromReadOffsets,
			);
		try {
			await consumer.subscribe({
				topics: [config.topic],
				fromBeginning: false,
			});
			await consumer.run({ eachMessage, autoCommit: !isPerProcess });
		} catch (cause) {
			removeGroupJoinListener?.();
			removeGroupJoinListener = undefined;
			throw cause;
		}
	}

	async function stop(): Promise<void> {
		removeGroupJoinListener?.();
		await consumer.disconnect();
	}

	return { start, stop };
}

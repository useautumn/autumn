import type { CatalogCache } from "@autumn/catalog-lru";
import type { HeraldEnv } from "@autumn/env/herald";
import { createKafkaClient, createKafkaTransport } from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { EventsDb, PostgresClient } from "@autumn/postgres";
import type { SvixClient } from "@autumn/svix";
import type { EventsTinybird } from "@autumn/tinybird";
import { Kafka } from "kafkajs";
import { createCatalogInvalidationConsumer } from "../catalog/createCatalogInvalidationConsumer.js";
import { createHeraldConsumers } from "../consumers/heraldConsumers.js";
import { createStreamConsumer } from "../stream/createStreamConsumer.js";

export type Herald = { start(): Promise<void>; stop(): Promise<void> };

/** Wiring only: one Kafka client, and every job started over the balance log. */
export function createHerald({
	ctx,
	config,
}: {
	ctx: {
		logger: AutumnLogger;
		eventsDb: EventsDb;
		eventsTinybird: EventsTinybird | null;
		svix: SvixClient | null;
		catalogCache: CatalogCache;
		postgres: Pick<PostgresClient, "close">;
	};
	config: { env: HeraldEnv };
}): Herald {
	const { env } = config;
	const kafka = new Kafka(
		createKafkaClient({
			clientId: `herald-${crypto.randomUUID()}`,
			brokers: env.KAFKA_BROKERS,
			transport: createKafkaTransport({
				authMode: env.KAFKA_AUTH_MODE,
				region: env.AWS_REGION,
			}),
			limits: {
				connectionTimeoutMs: 5000,
				requestTimeoutMs: 30000,
				retryCount: 2,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1000,
			},
		}),
	);
	const running = createHeraldConsumers({ ctx }).map(toRunning);
	const catalogInvalidations = createCatalogInvalidationConsumer({
		ctx: { kafka, catalogCache: ctx.catalogCache, logger: ctx.logger },
		config: {
			topic: env.HERALD_CATALOG_INVALIDATION_TOPIC,
			groupIdPrefix: `${env.HERALD_GROUP_ID}-catalog`,
		},
	});

	function toRunning(
		streamConsumer: ReturnType<typeof createHeraldConsumers>[number],
	) {
		return createStreamConsumer({
			ctx: { kafka, logger: ctx.logger },
			config: {
				topic: env.HERALD_METERING_TOPIC,
				groupIdPrefix: env.HERALD_GROUP_ID,
			},
			streamConsumer,
		});
	}

	async function start(): Promise<void> {
		await catalogInvalidations.start();
		for (const consumer of running) await consumer.start();
		ctx.logger.info(
			`Herald reading ${env.HERALD_METERING_TOPIC}, ${running.length} job(s)`,
		);
	}

	async function stop(): Promise<void> {
		for (const consumer of running) await consumer.stop();
		await catalogInvalidations.stop();
		await Promise.all([ctx.eventsDb.close(), ctx.postgres.close()]);
	}

	return { start, stop };
}

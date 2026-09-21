import type { HeraldEnv } from "@autumn/env/herald";
import { createKafkaClient, createKafkaTransport } from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { EventsDb } from "@autumn/postgres";
import { Kafka } from "kafkajs";
import { createHeraldConsumers } from "../consumers/heraldConsumers.js";
import { createStreamConsumer } from "../stream/createStreamConsumer.js";

export type Herald = { start(): Promise<void>; stop(): Promise<void> };

/** Wiring only: one Kafka client, and every job started over the balance log. */
export function createHerald({
	ctx,
	config,
}: {
	ctx: { logger: AutumnLogger; eventsDb: EventsDb };
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
		for (const consumer of running) await consumer.start();
		ctx.logger.info(
			`Herald reading ${env.HERALD_METERING_TOPIC}, ${running.length} job(s)`,
		);
	}

	async function stop(): Promise<void> {
		for (const consumer of running) await consumer.stop();
		await ctx.eventsDb.close();
	}

	return { start, stop };
}

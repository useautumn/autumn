import { getBalanceWorkerClientEnv } from "@autumn/env/balanceWorkerClient";
import {
	createKafkaClient,
	createOwnershipConsumer,
	type OwnershipConsumer,
} from "@autumn/kafka";
import { Kafka } from "kafkajs";
import { logger } from "@/external/logtail/logtailUtils.js";

let ownershipConsumer: OwnershipConsumer | undefined;

export function getOwnershipConsumer(): OwnershipConsumer {
	if (ownershipConsumer) return ownershipConsumer;
	const env = getBalanceWorkerClientEnv();
	const kafka = new Kafka(
		createKafkaClient({
			clientId: "autumn-server-ownership",
			brokers: env.KAFKA_BROKERS,
			transport: {},
			limits: {
				connectionTimeoutMs: 3_000,
				requestTimeoutMs: 10_000,
				retryCount: 3,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
		}),
	);
	ownershipConsumer = createOwnershipConsumer({
		ctx: { kafka },
		config: {
			topic: env.BALANCE_WORKER_OWNERSHIP_TOPIC,
			groupIdPrefix: "autumn-server-ownership",
		},
	});
	return ownershipConsumer;
}

export async function startOwnershipConsumer(): Promise<void> {
	const env = getBalanceWorkerClientEnv();
	if (!env.BALANCE_WORKER_ROLLOUT_ENABLED) {
		logger.info(
			"[balance-worker] Ownership consumer skipped: rollout disabled",
		);
		return;
	}
	const startedAt = performance.now();
	logger.info(
		{ brokers: env.KAFKA_BROKERS, topic: env.BALANCE_WORKER_OWNERSHIP_TOPIC },
		"[balance-worker] Starting Kafka ownership consumer; waiting for initial catch-up",
	);
	try {
		await getOwnershipConsumer().start();
	} catch (error) {
		logger.error(
			{ error, durationMs: Math.round(performance.now() - startedAt) },
			"[balance-worker] Kafka ownership consumer startup failed",
		);
		throw error;
	}
	logger.info(
		`[balance-worker] Kafka ownership consumer ready; initial catch-up complete (${Math.round(performance.now() - startedAt)}ms)`,
	);
}

export async function stopOwnershipConsumer(): Promise<void> {
	await ownershipConsumer?.stop();
}

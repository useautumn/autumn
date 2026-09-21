import { getBalanceWorkerClientEnv } from "@autumn/env/balanceWorkerClient";
import { BALANCE_WORKER_OWNERSHIP_CATCH_UP_TIMEOUT_MS } from "@autumn/env/balanceWorkerConstants";
import {
	createKafkaClient,
	createKafkaTransport,
	createOwnershipConsumer,
	type OwnershipConsumer,
} from "@autumn/kafka";
import { Kafka } from "kafkajs";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getBalanceWorkerRolloutEnabled } from "./getBalanceWorkerRolloutEnabled.js";

let ownershipConsumer: OwnershipConsumer | undefined;

/** A failed consumer aborts its own lifetime, so it cannot be started again.
 *  Dropping it lets the next attempt build a fresh one. Callers reach the
 *  consumer through this function every time rather than holding a reference,
 *  so a replacement is picked up without rewiring anything. */
function discardOwnershipConsumer(): void {
	ownershipConsumer = undefined;
}

export function getOwnershipConsumer(): OwnershipConsumer {
	if (ownershipConsumer) return ownershipConsumer;
	const env = getBalanceWorkerClientEnv();
	ownershipConsumer = createServerOwnershipConsumer({
		topic: env.BALANCE_WORKER_OWNERSHIP_TOPIC,
		groupIdPrefix: "autumn-server-ownership",
	});
	return ownershipConsumer;
}

export function createServerOwnershipConsumer({
	topic,
	groupIdPrefix,
}: {
	topic: string;
	groupIdPrefix: string;
}): OwnershipConsumer {
	const env = getBalanceWorkerClientEnv();
	const kafka = new Kafka(
		createKafkaClient({
			clientId: groupIdPrefix,
			brokers: env.KAFKA_BROKERS,
			transport: createKafkaTransport({
				authMode: env.KAFKA_AUTH_MODE,
				region: env.AWS_REGION,
			}),
			limits: {
				connectionTimeoutMs: 3_000,
				requestTimeoutMs: 10_000,
				retryCount: 3,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1_000,
			},
		}),
	);
	return createOwnershipConsumer({
		ctx: { kafka },
		config: {
			topic,
			groupIdPrefix,
			catchUpTimeoutMs: BALANCE_WORKER_OWNERSHIP_CATCH_UP_TIMEOUT_MS,
		},
	});
}

export async function startOwnershipConsumer(): Promise<void> {
	if (!getBalanceWorkerRolloutEnabled()) {
		logger.info(
			"[balance-worker] Ownership consumer skipped: rollout disabled",
		);
		return;
	}
	const env = getBalanceWorkerClientEnv();
	const startedAt = performance.now();
	logger.info(
		{ brokers: env.KAFKA_BROKERS, topic: env.BALANCE_WORKER_OWNERSHIP_TOPIC },
		"[balance-worker] Starting Kafka ownership consumer; waiting for initial catch-up",
	);
	// Routing is useless without owners and nothing else retries this, so keep
	// trying rather than leaving the server to answer every routed request with
	// "no owner" until somebody redeploys it.
	for (let attempt = 1; ; attempt++) {
		try {
			await getOwnershipConsumer().start();
			logger.info(
				`[balance-worker] Kafka ownership consumer ready; initial catch-up complete (${Math.round(performance.now() - startedAt)}ms, attempt ${attempt})`,
			);
			return;
		} catch (error) {
			discardOwnershipConsumer();
			const waitMs = ownershipRetryDelayMs({ attempt });
			logger.error(
				{
					error,
					attempt,
					retryInMs: waitMs,
					durationMs: Math.round(performance.now() - startedAt),
				},
				"[balance-worker] Kafka ownership consumer startup failed; retrying",
			);
			await new Promise((resolve) => setTimeout(resolve, waitMs));
		}
	}
}

/** Backs off quickly at first, then settles into a steady retry. */
function ownershipRetryDelayMs({ attempt }: { attempt: number }): number {
	const schedule = [1_000, 2_000, 5_000, 10_000, 30_000];
	return schedule[Math.min(attempt, schedule.length) - 1] ?? 30_000;
}

export async function stopOwnershipConsumer(): Promise<void> {
	await ownershipConsumer?.stop();
}

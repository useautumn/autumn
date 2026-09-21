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

/** The consumer routing reads from. Only ever a consumer that finished its
 *  catch-up, so routing cannot end up reading an empty owner table. */
let readyConsumer: OwnershipConsumer | undefined;
/** The consumer the current startup attempt is working on. A failed consumer
 *  aborts its own lifetime and cannot be started again, so each attempt builds
 *  its own and only promotes it once it is caught up. */
let startingConsumer: OwnershipConsumer | undefined;

function buildOwnershipConsumer(): OwnershipConsumer {
	const env = getBalanceWorkerClientEnv();
	return createServerOwnershipConsumer({
		topic: env.BALANCE_WORKER_OWNERSHIP_TOPIC,
		groupIdPrefix: "autumn-server-ownership",
	});
}

/** Never constructs. Routing asks for owners constantly, and building a consumer
 *  on that path once meant a request that arrived between a failed attempt and
 *  the next one got a brand new consumer whose owner table was empty, so it
 *  resolved no owner for every partition and answered 503 while a perfectly good
 *  ownership log said otherwise. */
export function getOwnershipConsumer(): OwnershipConsumer | undefined {
	return readyConsumer;
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
			startingConsumer ??= buildOwnershipConsumer();
			await startingConsumer.start();
			readyConsumer = startingConsumer;
			logger.info(
				`[balance-worker] Kafka ownership consumer ready; initial catch-up complete (${Math.round(performance.now() - startedAt)}ms, attempt ${attempt})`,
			);
			return;
		} catch (error) {
			// The failed consumer cannot be restarted, so the next attempt builds a
			// fresh one. Whatever routing was already using stays in place.
			startingConsumer = undefined;
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
	const running = readyConsumer ?? startingConsumer;
	readyConsumer = undefined;
	startingConsumer = undefined;
	await running?.stop();
}

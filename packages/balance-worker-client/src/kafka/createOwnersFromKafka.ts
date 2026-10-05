import { createOwnershipConsumer, type OwnershipConsumer } from "@autumn/kafka";
import type { PartitionOwner } from "../routing/types/routing.js";
import type {
	BalanceWorkerKafka,
	ClientLogger,
	OwnersFromKafka,
	OwnersFromKafkaConfig,
} from "./types/kafkaBalanceWorkerClient.js";

const DEFAULT_START_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

type OwnersState = {
	/** Only ever a consumer that finished its catch-up, so routing never reads an empty owner table. */
	ready?: OwnershipConsumer;
	/** A failed consumer cannot restart, so each attempt builds its own and promotes it once caught up. */
	starting?: OwnershipConsumer;
	stopped: boolean;
};

function sleep({ ms }: { ms: number }): Promise<void> {
	const slept = Promise.withResolvers<void>();
	setTimeout(slept.resolve, ms);
	return slept.promise;
}

export function createOwnersFromKafka({
	ctx,
	config,
}: {
	ctx: { kafka: BalanceWorkerKafka; logger?: ClientLogger };
	config: OwnersFromKafkaConfig;
}): OwnersFromKafka {
	const state: OwnersState = { stopped: false };
	const retryDelaysMs =
		config.startRetryDelaysMs ?? DEFAULT_START_RETRY_DELAYS_MS;

	function findOwner(params: {
		partition: number;
	}): PartitionOwner | undefined {
		return state.ready?.findOwner(params);
	}

	async function refresh(): Promise<void> {
		await state.ready?.refresh();
	}

	function build(): OwnershipConsumer {
		const consumer = createOwnershipConsumer({
			ctx: { kafka: ctx.kafka, onFailed: replaceFailed },
			config: {
				topic: config.topic,
				groupIdPrefix: config.groupIdPrefix,
				catchUpTimeoutMs: config.catchUpTimeoutMs,
			},
		});
		/** A failed consumer would answer every lookup with an error until the process restarted. */
		function replaceFailed({ cause }: { cause: unknown }): void {
			if (state.stopped || state.ready !== consumer) return;
			state.ready = undefined;
			ctx.logger?.error(
				{ error: cause, type: "balance_worker_ownership_failed" },
				"[balance-worker] Kafka ownership consumer failed; rebuilding it",
			);
			void stopFailed({ consumer });
			void start();
		}
		return consumer;
	}

	/** Stopped rather than abandoned: a leaked membership stays in the group, and a fleet of retrying servers piles them up. */
	async function stopFailed({
		consumer,
	}: {
		consumer?: OwnershipConsumer;
	}): Promise<void> {
		try {
			await consumer?.stop();
		} catch (cause) {
			ctx.logger?.warn(
				{ error: cause },
				"[balance-worker] Could not stop a failed ownership consumer",
			);
		}
	}

	async function discardFailed(): Promise<void> {
		const abandoned = state.starting;
		state.starting = undefined;
		await stopFailed({ consumer: abandoned });
	}

	/** Routing is useless without owners and nothing else retries this, so it keeps trying. */
	async function start(): Promise<void> {
		const startedAt = performance.now();
		ctx.logger?.info(
			{ topic: config.topic },
			"[balance-worker] Starting Kafka ownership consumer; waiting for initial catch-up",
		);
		for (let attempt = 1; !state.stopped; attempt++) {
			try {
				state.starting ??= build();
				await state.starting.start();
				state.ready = state.starting;
				state.starting = undefined;
				ctx.logger?.info(
					`[balance-worker] Kafka ownership consumer ready; initial catch-up complete (${Math.round(performance.now() - startedAt)}ms, attempt ${attempt})`,
				);
				return;
			} catch (cause) {
				await discardFailed();
				const waitMs =
					retryDelaysMs[Math.min(attempt, retryDelaysMs.length) - 1] ?? 0;
				// A boot-time blip clears on retry; only a consumer still failing is worth reporting.
				ctx.logger?.[attempt >= 3 ? "error" : "warn"](
					{
						error: cause,
						type: "balance_worker_ownership_start_failed",
						attempt,
						retryInMs: waitMs,
						durationMs: Math.round(performance.now() - startedAt),
					},
					"[balance-worker] Kafka ownership consumer startup failed; retrying",
				);
				await sleep({ ms: waitMs });
			}
		}
	}

	async function stop(): Promise<void> {
		state.stopped = true;
		const running = state.ready ?? state.starting;
		state.ready = undefined;
		state.starting = undefined;
		await running?.stop();
	}

	return { findOwner, refresh, start, stop };
}

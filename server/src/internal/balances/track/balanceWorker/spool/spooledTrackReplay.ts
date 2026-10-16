import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { BALANCE_WORKER_SPOOLED_TRACK_MAX_AGE_MS } from "@autumn/env/balanceWorkerConstants";
import type { TrackParams } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { TokenDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { trackParamsToTrackCommands } from "../balanceWorkerTrackRequest.js";
import { fenceOriginalOnWorker } from "./fenceOriginalOnWorker.js";
import { SpooledTrackTooOldError } from "./spooledTrackErrors.js";

type ReplayClient = Pick<BalanceWorkerClient, "queue" | "track">;

/** "settled": nothing more to do. "apply_on_redis": the original provably never deducts, so Redis applies it. */
export type SpooledTrackReplay = "settled" | "apply_on_redis";

const SPOOLED_TRACK_REPLAY_APPEND_TIMEOUT_MS = 1_000;

function assertSpooledTrackReplayable({
	ctx,
	body,
	spooledAt,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	spooledAt: number;
}): void {
	const ageMs = Date.now() - spooledAt;
	if (ageMs <= BALANCE_WORKER_SPOOLED_TRACK_MAX_AGE_MS) return;
	ctx.logger.error(
		"[track] spooled track is too old to replay on the balance worker; refusing it",
		{
			type: "balance_worker_track_spool_stale_refused",
			drain_lag_ms: ageMs,
			max_replay_age_ms: BALANCE_WORKER_SPOOLED_TRACK_MAX_AGE_MS,
			feature_id: body.feature_id,
			event_name: body.event_name,
		},
	);
	throw new SpooledTrackTooOldError({ ageMs });
}

/**
 * A customer still on the worker gets the exact commands re-appended to its command-log partition, where the worker
 * dedupes them against a late original. A customer now on Redis is applied there only once the worker has settled
 * that the original never deducts; one that did land is dropped, and one whose fate is unknown is retried.
 */
export async function replaySpooledTrack({
	ctx,
	body,
	tokens,
	spooledAt,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	body: TrackParams;
	tokens?: TokenDeduction;
	spooledAt: number;
	client?: ReplayClient;
}): Promise<SpooledTrackReplay> {
	assertSpooledTrackReplayable({ ctx, body, spooledAt });
	const commands = trackParamsToTrackCommands({
		ctx,
		body,
		recordsCreditCost: tokens !== undefined,
	});
	if (isBalanceWorkerRolloutEnabled({ ctx, customerId: body.customer_id })) {
		// Short, so a replay failing on a still-sick log frees its poll batch fast; SQS retries it later.
		await client.queue.track({
			commands,
			signal: AbortSignal.timeout(SPOOLED_TRACK_REPLAY_APPEND_TIMEOUT_MS),
		});
		logSpooledTrackDrained({ ctx, body, spooledAt, drain: "command_log" });
		return "settled";
	}

	let fate: Awaited<ReturnType<typeof fenceOriginalOnWorker>>;
	try {
		fate = await fenceOriginalOnWorker({ commands, client });
	} catch (error) {
		ctx.logger.warn(
			"[track] could not settle a spooled track's original on the balance worker; retrying",
			{
				type: "balance_worker_track_spool_fate_unknown",
				drain_lag_ms: Date.now() - spooledAt,
				feature_id: body.feature_id,
				event_name: body.event_name,
				error: error instanceof Error ? error.message : String(error),
			},
		);
		throw error;
	}
	if (fate === "landed") {
		logSpooledTrackDrained({ ctx, body, spooledAt, drain: "original_landed" });
		return "settled";
	}
	logSpooledTrackDrained({ ctx, body, spooledAt, drain: "redis" });
	return "apply_on_redis";
}

function logSpooledTrackDrained({
	ctx,
	body,
	spooledAt,
	drain,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	spooledAt: number;
	drain: "command_log" | "original_landed" | "redis";
}): void {
	ctx.logger.info("[track] spooled track drained", {
		type: "balance_worker_track_spool_drained",
		drain_lag_ms: Date.now() - spooledAt,
		drain_engine: drain,
		feature_id: body.feature_id,
		event_name: body.event_name,
	});
}

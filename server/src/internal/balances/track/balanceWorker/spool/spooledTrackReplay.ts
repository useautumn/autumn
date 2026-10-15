import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { BALANCE_WORKER_SPOOLED_TRACK_MAX_AGE_MS } from "@autumn/env/balanceWorkerConstants";
import type { TrackParams } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { TokenDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { trackParamsToTrackCommands } from "../balanceWorkerTrackRequest.js";

type QueueClient = Pick<BalanceWorkerClient, "queue">;

const SPOOLED_TRACK_REPLAY_APPEND_TIMEOUT_MS = 1_000;

/** Retried rather than dropped, so the queue's redrive parks it in the DLQ: replaying could deduct twice, dropping could lose it. */
export class SpooledTrackTooOldError extends Error {
	constructor({ ageMs }: { ageMs: number }) {
		super(
			`Spooled track is ${ageMs}ms old, past the ${BALANCE_WORKER_SPOOLED_TRACK_MAX_AGE_MS}ms the balance worker's dedup covers`,
		);
		this.name = "SpooledTrackTooOldError";
	}
}

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

/** Re-appends the exact commands the stalled append carried, onto the same command-log partition. The worker
 *  decides both copies in log order under one command id, so whichever lands second is a no-op. */
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
	client?: QueueClient;
}): Promise<void> {
	assertSpooledTrackReplayable({ ctx, body, spooledAt });
	const commands = trackParamsToTrackCommands({
		ctx,
		body,
		recordsCreditCost: tokens !== undefined,
	});
	// Short, so a replay failing on a still-sick log frees its poll batch fast; SQS retries it later.
	await client.queue.track({
		commands,
		signal: AbortSignal.timeout(SPOOLED_TRACK_REPLAY_APPEND_TIMEOUT_MS),
	});
	logSpooledTrackDrained({ ctx, body, spooledAt });
}

function logSpooledTrackDrained({
	ctx,
	body,
	spooledAt,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	spooledAt: number;
}): void {
	const routedToWorker = isBalanceWorkerRolloutEnabled({
		ctx,
		customerId: body.customer_id,
	});
	const fields = {
		type: "balance_worker_track_spool_drained",
		drain_lag_ms: Date.now() - spooledAt,
		drain_engine: "command_log",
		routed_to_worker: routedToWorker,
		feature_id: body.feature_id,
		event_name: body.event_name,
	};
	if (routedToWorker) {
		ctx.logger.info(
			"[track] spooled track re-appended to the command log",
			fields,
		);
		return;
	}
	// The original may already be on the worker's log, so Redis would apply it a second time.
	ctx.logger.warn(
		"[track] spooled track re-appended to the command log after its customer moved off the worker",
		fields,
	);
}

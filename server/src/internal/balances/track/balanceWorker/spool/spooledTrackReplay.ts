import { BALANCE_WORKER_SPOOLED_TRACK_MAX_AGE_MS } from "@autumn/env/balanceWorkerConstants";
import type { TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Retried rather than dropped, so the queue's redrive parks it in the DLQ: replaying could deduct twice, dropping could lose it. */
export class SpooledTrackTooOldError extends Error {
	constructor({ ageMs }: { ageMs: number }) {
		super(
			`Spooled track is ${ageMs}ms old, past the ${BALANCE_WORKER_SPOOLED_TRACK_MAX_AGE_MS}ms the balance worker's dedup covers`,
		);
		this.name = "SpooledTrackTooOldError";
	}
}

export function assertSpooledTrackReplayable({
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

/** A replay on Redis crossed engines: if the original append landed late, the worker applied it too. */
export function logSpooledTrackDrained({
	ctx,
	body,
	spooledAt,
	onWorker,
	alreadyApplied,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	spooledAt: number;
	onWorker: boolean;
	alreadyApplied: boolean;
}): void {
	const fields = {
		type: "balance_worker_track_spool_drained",
		drain_lag_ms: Date.now() - spooledAt,
		drain_engine: onWorker ? "worker" : "redis",
		already_applied: alreadyApplied,
		feature_id: body.feature_id,
		event_name: body.event_name,
	};
	if (onWorker) {
		ctx.logger.info(
			"[track] spooled track drained on the balance worker",
			fields,
		);
		return;
	}
	ctx.logger.warn(
		"[track] spooled worker track drained on Redis after a routing change",
		fields,
	);
}

import {
	BALANCE_WORKER_TRACK_APPEND_DEADLINE_MS,
	BALANCE_WORKER_TRACK_SPOOL_HEDGE_MS,
} from "@autumn/env/balanceWorkerConstants";
import type { TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { TokenDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import { rethrowUnspooledAppendError } from "../../../balanceWorker/balanceWorkerErrors.js";
import { type AppendAttempt, appendWithRetries } from "./appendWithRetries.js";
import { spoolTrack } from "./spoolTrack.js";
import type { AppendResult } from "./types/appendResult.js";

/** The append's result if it settles within the hedge, else null: it is slow or still retrying, and may yet land. */
const settleWithinHedge = ({
	appendResult,
}: {
	appendResult: Promise<AppendResult>;
}): Promise<AppendResult | null> =>
	new Promise((resolve) => {
		const hedge = setTimeout(
			() => resolve(null),
			BALANCE_WORKER_TRACK_SPOOL_HEDGE_MS,
		);
		void appendResult.then((result) => {
			clearTimeout(hedge);
			resolve(result);
		});
	});

/** True as soon as either write is durable, false once both have failed. */
const isEitherDurable = ({
	appendResult,
	spooled,
}: {
	appendResult: Promise<AppendResult>;
	spooled: Promise<boolean>;
}): Promise<boolean> =>
	new Promise((resolve) => {
		let failures = 0;
		const settle = (durable: boolean) => {
			if (durable) resolve(true);
			else if (++failures === 2) resolve(false);
		};
		void appendResult.then((result) => settle(result.acked));
		void spooled.then(settle);
	});

/**
 * The command-log append, retried on retriable Kafka errors, with the async track queue as a second durable home once
 * the hedge passes. The track is accepted when either write lands; only both failing by the deadline is a 503.
 */
export async function appendOrSpoolTrack({
	ctx,
	body,
	tokens,
	append,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	tokens?: TokenDeduction;
	append: AppendAttempt;
}): Promise<void> {
	const startedAt = performance.now();
	const spoolLanded = new AbortController();
	const appendResult = appendWithRetries({
		ctx,
		append,
		deadline: startedAt + BALANCE_WORKER_TRACK_APPEND_DEADLINE_MS,
		stop: spoolLanded.signal,
	});
	const early = await settleWithinHedge({ appendResult });
	if (early?.acked) return;

	const spooled = spoolTrack({
		ctx,
		body,
		tokens,
		reason: early ? "append_failed" : "append_slow",
		appendError: early && !early.acked ? early.error : undefined,
		startedAt,
	}).then((landed) => {
		// SQS holds the track, so further Kafka attempts would only add copies for the worker to dedupe.
		if (landed) spoolLanded.abort();
		return landed;
	});
	if (await isEitherDurable({ appendResult, spooled })) return;

	const final = await appendResult;
	if (final.acked) return;
	ctx.logger.error("[balanceWorker] track append and SQS spool both failed", {
		type: "balance_worker_track_spool_failed",
		feature_id: body.feature_id,
		event_name: body.event_name,
		append_error:
			final.error instanceof Error ? final.error.message : String(final.error),
	});
	rethrowUnspooledAppendError({ cause: final.error });
}

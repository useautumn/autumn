import type { TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { TokenDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import { rethrowUnspooledAppendError } from "../../../balanceWorker/balanceWorkerErrors.js";
import { spoolTrack } from "./spoolTrack.js";
import { getTrackSpoolHedgeMs } from "./trackSpoolConfig.js";

type AppendResult = { acked: true } | { acked: false; error: unknown };

const settleAppend = async (
	append: () => Promise<void>,
): Promise<AppendResult> => {
	try {
		await append();
		return { acked: true };
	} catch (error) {
		return { acked: false, error };
	}
};

/** The append's result if it settles within the hedge, else null: it is slow and may still land. */
const settleWithinHedge = ({
	appendResult,
	hedgeMs,
}: {
	appendResult: Promise<AppendResult>;
	hedgeMs: number;
}): Promise<AppendResult | null> =>
	new Promise((resolve) => {
		const hedge = setTimeout(() => resolve(null), hedgeMs);
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
 * The command-log append with the async track queue as a second durable home: an append that fails, or is still
 * unacked after the hedge, is spooled, and the track is accepted once either write lands. Both failing is a 503.
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
	append: () => Promise<void>;
}): Promise<void> {
	const startedAt = performance.now();
	const appendResult = settleAppend(append);
	const early = await settleWithinHedge({
		appendResult,
		hedgeMs: getTrackSpoolHedgeMs(),
	});
	if (early?.acked) return;

	const spooled = spoolTrack({
		ctx,
		body,
		tokens,
		reason: early ? "append_failed" : "append_slow",
		appendError: early && !early.acked ? early.error : undefined,
		startedAt,
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

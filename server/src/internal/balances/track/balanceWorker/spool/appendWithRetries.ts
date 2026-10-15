import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isRetriableAppendError } from "./isRetriableAppendError.js";
import type { AppendResult } from "./types/appendResult.js";

export type AppendAttempt = (params: { signal: AbortSignal }) => Promise<void>;

const INITIAL_BACKOFF_MS = 50;
const MAX_BACKOFF_MS = 400;

const settleAttempt = async ({
	append,
	deadline,
}: {
	append: AppendAttempt;
	deadline: number;
}): Promise<AppendResult> => {
	try {
		const remainingMs = Math.max(1, Math.ceil(deadline - performance.now()));
		await append({ signal: AbortSignal.timeout(remainingMs) });
		return { acked: true };
	} catch (error) {
		return { acked: false, error };
	}
};

/** Resolves after `ms`, or as soon as `stop` aborts. */
const pause = ({ ms, stop }: { ms: number; stop: AbortSignal }) =>
	new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		stop.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true },
		);
	});

/**
 * Sends the append again after each retriable Kafka failure until it acks, the deadline passes, or `stop` says SQS
 * holds the track. kafkajs refreshes the producer's metadata in a failed send's error path, so each retry finds the new leader.
 */
export async function appendWithRetries({
	ctx,
	append,
	deadline,
	stop,
}: {
	ctx: AutumnContext;
	append: AppendAttempt;
	deadline: number;
	stop: AbortSignal;
}): Promise<AppendResult> {
	let backoffMs = INITIAL_BACKOFF_MS;
	for (let attempt = 1; ; attempt++) {
		const result = await settleAttempt({ append, deadline });
		if (result.acked) {
			if (attempt > 1)
				ctx.logger.info("[balanceWorker] track append landed after retries", {
					type: "balance_worker_track_append_retried",
					append_attempts: attempt,
				});
			return result;
		}
		const outOfTime = performance.now() + backoffMs >= deadline;
		if (stop.aborted || outOfTime || !isRetriableAppendError(result.error))
			return result;
		await pause({ ms: backoffMs, stop });
		if (stop.aborted) return result;
		backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
	}
}

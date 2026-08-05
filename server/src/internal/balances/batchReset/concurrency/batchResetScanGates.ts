import { ms } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { getResetJobV2Config } from "@/internal/misc/edgeConfigs/resetJobV2/resetJobV2Store.js";
import { getBatchResetQueueDepth } from "./getBatchResetQueueDepth.js";
import { sleepWithAbort } from "./sleepWithAbort.js";

// SQS counts are approximate — only trust "empty" after consecutive reads.
const CONSECUTIVE_EMPTY_READS_REQUIRED = 2;
const BARRIER_STUCK_WARN_MS = ms.minutes(30);
const BARRIER_GIVE_UP_MS = ms.minutes(45);

/**
 * Gate A — in-sweep backpressure. Blocks while the batch reset queue holds
 * more than queueHighWaterMessages, so the scanner never runs further ahead
 * of the workers than one high-water mark of messages.
 *
 * Fails open (with a warning) on SQS errors or when no dedicated queue is
 * configured — a metrics hiccup should not stop resets.
 */
export const waitForQueueBelowHighWater = async ({
	logger,
	signal,
}: {
	logger: Logger;
	signal: AbortSignal;
}): Promise<void> => {
	while (!signal.aborted) {
		let depth: Awaited<ReturnType<typeof getBatchResetQueueDepth>>;
		try {
			depth = await getBatchResetQueueDepth();
		} catch (error) {
			logger.warn(
				`[reset-cus-ents-v2] queue depth check failed, scanning without backpressure: ${error}`,
			);
			return;
		}

		const { queueHighWaterMessages, queueDepthPollMs } = getResetJobV2Config();
		if (!depth || depth.total <= queueHighWaterMessages) return;

		logger.info("[reset-cus-ents-v2] queue above high water, pausing scan", {
			jobName: "reset-cus-ents-v2",
			data: {
				queueVisible: depth.visible,
				queueInFlight: depth.inFlight,
				highWater: queueHighWaterMessages,
			},
		});
		await sleepWithAbort({ delayMs: queueDepthPollMs, signal });
	}
};

/**
 * Gate B — sweep-restart barrier. Blocks until the batch reset queue is
 * fully drained (zero visible AND zero in-flight, on consecutive reads), so
 * a new sweep can never re-enqueue rows the workers are still processing.
 *
 * Warns at BARRIER_STUCK_WARN_MS, then gives up at BARRIER_GIVE_UP_MS rather
 * than stalling resets indefinitely behind one wedged message: re-enqueueing a
 * still-queued row is a no-op, since classifyNoAction rejects rows that are no
 * longer due. Fails open on SQS errors or when no dedicated queue is
 * configured.
 */
export const waitForQueueDrained = async ({
	logger,
	signal,
}: {
	logger: Logger;
	signal: AbortSignal;
}): Promise<void> => {
	const startedAt = Date.now();
	let consecutiveEmptyReads = 0;
	let warnedStuck = false;

	while (!signal.aborted) {
		let depth: Awaited<ReturnType<typeof getBatchResetQueueDepth>>;
		try {
			depth = await getBatchResetQueueDepth();
		} catch (error) {
			logger.warn(
				`[reset-cus-ents-v2] queue depth check failed, restarting sweep without barrier: ${error}`,
			);
			return;
		}

		if (!depth) return;

		if (depth.total === 0) {
			consecutiveEmptyReads++;
			if (consecutiveEmptyReads >= CONSECUTIVE_EMPTY_READS_REQUIRED) return;
		} else {
			consecutiveEmptyReads = 0;
		}

		const waitedMs = Date.now() - startedAt;

		if (!warnedStuck && waitedMs > BARRIER_STUCK_WARN_MS) {
			warnedStuck = true;
			logger.error(
				"[reset-cus-ents-v2] sweep barrier stuck — workers not draining the batch reset queue",
				{
					jobName: "reset-cus-ents-v2",
					data: {
						queueVisible: depth.visible,
						queueInFlight: depth.inFlight,
						waitedMs,
					},
				},
			);
		}

		if (waitedMs > BARRIER_GIVE_UP_MS) {
			logger.error(
				"[reset-cus-ents-v2] sweep barrier abandoned — restarting sweep with messages still in flight",
				{
					jobName: "reset-cus-ents-v2",
					data: {
						queueVisible: depth.visible,
						queueInFlight: depth.inFlight,
						waitedMs,
					},
				},
			);
			return;
		}

		await sleepWithAbort({
			delayMs: getResetJobV2Config().queueDepthPollMs,
			signal,
		});
	}
};

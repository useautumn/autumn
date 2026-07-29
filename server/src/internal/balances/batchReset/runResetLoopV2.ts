import { ms } from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import type { CronContext } from "@/cron/utils/CronContext.js";
import type {
	ResetEligibleCustomerEntitlementRow,
	ResetScanCursor,
} from "@/internal/customers/cusProducts/cusEnts/repos/getResetEligibleCustomerEntitlementsPage.js";
import { customerEntitlementsRepo } from "@/internal/customers/cusProducts/cusEnts/repos/index.js";
import {
	getResetJobV2Config,
	isResetJobV2Enabled,
} from "@/internal/misc/resetJobV2/resetJobV2Store.js";
import { isActiveSlot } from "@/queue/blueGreen/blueGreenGate.js";
import {
	waitForQueueBelowHighWater,
	waitForQueueDrained,
} from "./concurrency/batchResetScanGates.js";
import { sleepWithAbort } from "./concurrency/sleepWithAbort.js";
import { enqueueBatchResetTask } from "./enqueueBatchResetTask.js";
import { logResetBacklogGauge } from "./logs/logResetBacklogGauge.js";
import type { BatchResetCustomerEntitlementsV2Payload } from "./types.js";

const JOB_NAME = "reset-cus-ents-v2";
const IDLE_DELAY_MS = ms.seconds(5);
const BACKLOG_GAUGE_INTERVAL_MS = ms.minutes(5);

/** Progress of the sweep currently in flight. */
type SweepState = {
	cursor: ResetScanCursor | null;
	dueBefore: number | null;
	startedAt: number | null;
	pages: number;
	scanned: number;
	messages: number;
};

const newSweepState = (): SweepState => ({
	cursor: null,
	dueBefore: null,
	startedAt: null,
	pages: 0,
	scanned: 0,
	messages: 0,
});

/** Chunks one scanned page into compact ID-only SQS payloads. */
export const pageToBatchResetPayloads = ({
	page,
	workerBatchSize,
}: {
	page: ResetEligibleCustomerEntitlementRow[];
	workerBatchSize: number;
}): BatchResetCustomerEntitlementsV2Payload[] => {
	const payloads: BatchResetCustomerEntitlementsV2Payload[] = [];

	for (let i = 0; i < page.length; i += workerBatchSize) {
		payloads.push({
			customerEntitlementIds: page
				.slice(i, i + workerBatchSize)
				.map((row) => row.id),
		});
	}
	return payloads;
};

const shouldRunPage = () =>
	process.env.DISABLE_CRON !== "true" &&
	isResetJobV2Enabled() &&
	isActiveSlot({ serviceName: "cron" });

/** Enqueues one scanned page and folds it into the sweep counters. */
const enqueuePage = async ({
	ctx,
	page,
	sweep,
	workerBatchSize,
}: {
	ctx: CronContext;
	page: ResetEligibleCustomerEntitlementRow[];
	sweep: SweepState;
	workerBatchSize: number;
}) => {
	const payloads = pageToBatchResetPayloads({ page, workerBatchSize });
	for (const payload of payloads) {
		await enqueueBatchResetTask({ payload, logger: ctx.logger });
	}

	const lastRow = page[page.length - 1];
	sweep.cursor = { nextResetAt: lastRow.nextResetAt, id: lastRow.id };
	sweep.pages++;
	sweep.scanned += page.length;
	sweep.messages += payloads.length;

	ctx.logger.info("[reset-cus-ents-v2] page enqueued", {
		jobName: JOB_NAME,
		data: {
			fetched: page.length,
			messages: payloads.length,
			dueBefore: sweep.dueBefore,
			sweepPages: sweep.pages,
			sweepScanned: sweep.scanned,
			cursorResetAt: lastRow.nextResetAt,
			cursorId: lastRow.id,
		},
	});
};

/** Gate B + completion event: wait for the workers to drain this sweep's
 * messages, then report it (idle sweeps that scanned nothing stay silent). */
const completeSweep = async ({
	ctx,
	signal,
	sweep,
}: {
	ctx: CronContext;
	signal: AbortSignal;
	sweep: SweepState;
}) => {
	const barrierStartedAt = Date.now();
	await waitForQueueDrained({ logger: ctx.logger, signal });

	if (sweep.scanned === 0 || sweep.startedAt === null) return;

	ctx.logger.info("[reset-cus-ents-v2] sweep completed", {
		jobName: JOB_NAME,
		data: {
			sweepPages: sweep.pages,
			sweepScanned: sweep.scanned,
			sweepMessages: sweep.messages,
			sweepDurationMs: Date.now() - sweep.startedAt,
			drainWaitMs: Date.now() - barrierStartedAt,
			dueBefore: sweep.dueBefore,
		},
	});
};

/**
 * V2 reset cron: a continuous keyset sweep over overdue customer entitlements,
 * fanned out to the batch reset queue.
 *
 * Flow per iteration: backlog gauge (rate-limited) -> Gate A (queue
 * backpressure) -> scan one page -> enqueue. When a sweep drains, Gate B
 * waits for the workers to finish before the cursor rewinds, so a new sweep
 * can never re-enqueue rows that are still queued or in flight.
 */
export const runResetLoopV2 = async ({
	ctx,
	signal,
}: {
	ctx: CronContext;
	signal: AbortSignal;
}) => {
	let sweep = newSweepState();
	let lastGaugeAt = 0;

	while (!signal.aborted) {
		let delayMs = IDLE_DELAY_MS;

		if (shouldRunPage()) {
			try {
				const { scanBatchSize, workerBatchSize, scanIntervalMs } =
					getResetJobV2Config();

				if (Date.now() - lastGaugeAt >= BACKLOG_GAUGE_INTERVAL_MS) {
					lastGaugeAt = Date.now();
					await logResetBacklogGauge({
						ctx,
						cursor: sweep.cursor,
						sweepScanned: sweep.scanned,
					});
				}

				// Gate A: don't scan further ahead than the workers can chew.
				await waitForQueueBelowHighWater({ logger: ctx.logger, signal });
				if (signal.aborted) break;

				sweep.dueBefore ??= Date.now();
				sweep.startedAt ??= Date.now();
				const page =
					await customerEntitlementsRepo.getResetEligibleCustomerEntitlementsPage(
						{
							db: ctx.db,
							dueBefore: sweep.dueBefore,
							cursor: sweep.cursor,
							limit: scanBatchSize,
						},
					);

				if (page.length > 0) {
					await enqueuePage({ ctx, page, sweep, workerBatchSize });
				}

				if (page.length === scanBatchSize) {
					delayMs = scanIntervalMs;
				} else {
					await completeSweep({ ctx, signal, sweep });
					sweep = newSweepState();
				}
			} catch (error) {
				sweep = newSweepState();
				ctx.logger.error("[reset-cus-ents-v2] page failed", {
					jobName: JOB_NAME,
					err: error,
				});
				Sentry.captureException(error, {
					extra: { context: "runResetLoopV2.fetchPage" },
				});
			}
		}

		await sleepWithAbort({ delayMs, signal });
	}
};

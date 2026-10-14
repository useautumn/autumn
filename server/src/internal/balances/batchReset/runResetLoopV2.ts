import { ms } from "@autumn/shared";
import type { CronContext } from "@/cron/utils/CronContext.js";
import { getBalanceWorkerRolloutOverride } from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";
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
import { enqueueWorkerResets } from "./enqueueWorkerResets/enqueueWorkerResets.js";
import { logResetBacklogGauge } from "./logs/logResetBacklogGauge.js";
import type { BatchResetCustomerEntitlementsV2Payload } from "./types.js";

const JOB_NAME = "reset-cus-ents-v2";
const IDLE_DELAY_MS = ms.seconds(5);
const BACKLOG_GAUGE_INTERVAL_MS = ms.minutes(5);

type ResetLane = "worker" | "sql";

type SweepState = {
	cursor: ResetScanCursor | null;
	dueBefore: number | null;
	startedAt: number | null;
	lane: ResetLane | null;
	pages: number;
	scanned: number;
	messages: number;
};

const newSweepState = (): SweepState => ({
	cursor: null,
	dueBefore: null,
	startedAt: null,
	lane: null,
	pages: 0,
	scanned: 0,
	messages: 0,
});

const chooseLane = (): ResetLane =>
	getBalanceWorkerRolloutOverride() === true ? "worker" : "sql";

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
	let messages: number;
	if (sweep.lane === "worker" && sweep.dueBefore !== null) {
		messages = await enqueueWorkerResets({
			ctx,
			page,
			dueBefore: sweep.dueBefore,
			now: Date.now(),
		});
	} else {
		const payloads = pageToBatchResetPayloads({ page, workerBatchSize });
		for (const payload of payloads) {
			await enqueueBatchResetTask({ payload, logger: ctx.logger });
		}
		messages = payloads.length;
	}

	const lastRow = page[page.length - 1];
	sweep.cursor = { nextResetAt: lastRow.nextResetAt, id: lastRow.id };
	sweep.pages++;
	sweep.scanned += page.length;
	sweep.messages += messages;

	ctx.logger.info("[reset-cus-ents-v2] page enqueued", {
		jobName: JOB_NAME,
		data: {
			lane: sweep.lane,
			fetched: page.length,
			messages,
			dueBefore: sweep.dueBefore,
			sweepPages: sweep.pages,
			sweepScanned: sweep.scanned,
			cursorResetAt: lastRow.nextResetAt,
			cursorId: lastRow.id,
		},
	});
};

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
			lane: sweep.lane,
			sweepDurationMs: Date.now() - sweep.startedAt,
			drainWaitMs: Date.now() - barrierStartedAt,
			dueBefore: sweep.dueBefore,
		},
	});
};

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

				await waitForQueueBelowHighWater({ logger: ctx.logger, signal });
				if (signal.aborted) break;

				sweep.dueBefore ??= Date.now();
				sweep.startedAt ??= Date.now();
				sweep.lane ??= chooseLane();
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
			}
		}

		await sleepWithAbort({ delayMs, signal });
	}
};

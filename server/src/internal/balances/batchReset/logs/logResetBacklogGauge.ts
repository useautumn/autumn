import type { CronContext } from "@/cron/utils/CronContext.js";
import type { ResetScanCursor } from "@/internal/customers/cusProducts/cusEnts/repos/getResetEligibleCustomerEntitlementsPage.js";
import { customerEntitlementsRepo } from "@/internal/customers/cusProducts/cusEnts/repos/index.js";
import { getBatchResetQueueDepth } from "../concurrency/getBatchResetQueueDepth.js";

// Cap keeps the count cheap against a large backlog ("at least N").
const BACKLOG_COUNT_CAP = 1_000_000;

/**
 * Periodic status event for Axiom: how many customer entitlements are
 * overdue-eligible right now, current queue depth, and how far behind "now"
 * the scan position is.
 */
export const logResetBacklogGauge = async ({
	ctx,
	cursor,
	sweepScanned,
}: {
	ctx: CronContext;
	cursor: ResetScanCursor | null;
	sweepScanned: number;
}) => {
	const [backlog, queueDepth] = await Promise.all([
		customerEntitlementsRepo.countResetEligibleCustomerEntitlements({
			db: ctx.db,
			dueBefore: Date.now(),
			cap: BACKLOG_COUNT_CAP,
		}),
		getBatchResetQueueDepth().catch(() => null),
	]);

	ctx.logger.info("[reset-cus-ents-v2] backlog gauge", {
		jobName: "reset-cus-ents-v2",
		data: {
			overdueEligibleCount: backlog.count,
			overdueCountCapped: backlog.capped,
			queueVisible: queueDepth?.visible ?? null,
			queueInFlight: queueDepth?.inFlight ?? null,
			sweepScanned,
			cursorResetAt: cursor?.nextResetAt ?? null,
			// How far behind "now" the scan position is, in ms.
			scanLagMs: cursor ? Date.now() - cursor.nextResetAt : null,
		},
	});
};

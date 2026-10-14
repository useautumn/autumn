import type { CronContext } from "@/cron/utils/CronContext.js";
import type { ResetScanCursor } from "@/internal/customers/cusProducts/cusEnts/repos/getResetEligibleCustomerEntitlementsPage.js";
import { getBatchResetQueueDepth } from "../concurrency/getBatchResetQueueDepth.js";

export const logResetBacklogGauge = async ({
	ctx,
	cursor,
	sweepScanned,
}: {
	ctx: CronContext;
	cursor: ResetScanCursor | null;
	sweepScanned: number;
}) => {
	const queueDepth = await getBatchResetQueueDepth().catch(() => null);

	ctx.logger.info("[reset-cus-ents-v2] backlog gauge", {
		jobName: "reset-cus-ents-v2",
		data: {
			queueVisible: queueDepth?.visible ?? null,
			queueInFlight: queueDepth?.inFlight ?? null,
			sweepScanned,
			cursorResetAt: cursor?.nextResetAt ?? null,
			scanLagMs: cursor ? Date.now() - cursor.nextResetAt : null,
		},
	});
};

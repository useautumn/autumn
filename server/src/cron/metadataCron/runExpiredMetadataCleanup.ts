import { deleteExpiredCheckoutMetadata } from "@/internal/metadata/actions/deleteExpiredCheckoutMetadata.js";
import { isExpiredMetadataCleanupEnabled } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import type { CronContext } from "../utils/CronContext.js";

const JOB_NAME = "expired-metadata-cleanup";

export const runExpiredMetadataCleanup = async ({
	ctx,
}: {
	ctx: CronContext;
}) => {
	if (!isExpiredMetadataCleanupEnabled()) return;

	const startedAt = performance.now();
	try {
		const { deleted } = await deleteExpiredCheckoutMetadata({ ctx });
		// New top-level fields would hit the express dataset's Axiom column limit, so counts live under `data`.
		ctx.logger.info(`[${JOB_NAME}] deleted ${deleted} rows`, {
			jobName: JOB_NAME,
			durationMs: Math.round(performance.now() - startedAt),
			data: { deleted },
		});
	} catch (error) {
		ctx.logger.error(`[${JOB_NAME}] failed`, {
			jobName: JOB_NAME,
			durationMs: Math.round(performance.now() - startedAt),
			error,
		});
	}
};

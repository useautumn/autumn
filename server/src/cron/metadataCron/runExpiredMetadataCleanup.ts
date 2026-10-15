import { deleteExpiredCheckoutMetadata } from "@/internal/metadata/actions/deleteExpiredCheckoutMetadata.js";
import { isExpiredMetadataCleanupEnabled } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import type { CronContext } from "../utils/CronContext.js";

export const runExpiredMetadataCleanup = async ({
	ctx,
}: {
	ctx: CronContext;
}) => {
	if (!isExpiredMetadataCleanupEnabled()) return;

	const startedAt = performance.now();
	try {
		const { deleted } = await deleteExpiredCheckoutMetadata({ ctx });
		ctx.logger.info(
			{
				type: "expired_metadata_cleanup",
				deleted,
				durationMs: Math.round(performance.now() - startedAt),
			},
			`[Expired Metadata Cleanup] Deleted ${deleted} rows`,
		);
	} catch (error) {
		ctx.logger.error(
			{
				type: "expired_metadata_cleanup",
				durationMs: Math.round(performance.now() - startedAt),
				error,
			},
			"[Expired Metadata Cleanup] Error",
		);
	}
};

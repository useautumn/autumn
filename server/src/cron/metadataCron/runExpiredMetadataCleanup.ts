import { deleteExpiredCheckoutMetadata } from "@/internal/metadata/actions/deleteExpiredCheckoutMetadata.js";
import { isExpiredMetadataCleanupEnabled } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import type { CronContext } from "../utils/CronContext.js";

export const runExpiredMetadataCleanup = async ({
	ctx,
}: {
	ctx: CronContext;
}) => {
	if (!isExpiredMetadataCleanupEnabled()) return;

	try {
		const { deleted } = await deleteExpiredCheckoutMetadata({ ctx });
		if (deleted > 0) {
			ctx.logger.info(`Deleted ${deleted} expired checkout metadata rows`);
		}
	} catch (error) {
		ctx.logger.error("[Expired Metadata Cleanup] Error", { error });
	}
};

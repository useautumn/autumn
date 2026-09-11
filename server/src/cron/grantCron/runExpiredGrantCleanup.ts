import { deleteExpiredGrants } from "@/internal/customers/cusProducts/cusEnts/actions/deleteExpiredGrants.js";
import { isExpiredGrantCleanupEnabled } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import type { CronContext } from "../utils/CronContext.js";

export const runExpiredGrantCleanup = async ({ ctx }: { ctx: CronContext }) => {
	if (!isExpiredGrantCleanupEnabled()) return;

	try {
		const { deleted } = await deleteExpiredGrants({ ctx });
		if (deleted > 0) {
			ctx.logger.info(`Deleted ${deleted} expired purchase grants`);
		}
	} catch (error) {
		ctx.logger.error("[Expired Grant Cleanup] Error", { error });
	}
};

import { cleanupOneOffCustomerProducts } from "@/internal/customers/cusProducts/actions/cleanupOneOff/cleanupOneOff.js";
import { isOneOffCleanupDisabled } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import type { CronContext } from "../utils/CronContext.js";

export const runOneOffCleanup = async ({ ctx }: { ctx: CronContext }) => {
	if (isOneOffCleanupDisabled()) return;

	try {
		const { cleanedUp } = await cleanupOneOffCustomerProducts({ ctx });
		ctx.logger.info(`Expired ${cleanedUp} depleted one-off customer products`);
		console.log(`Expired ${cleanedUp} depleted one-off customer products`);
	} catch (error) {
		console.error("[One-off Cleanup] Error:", error);
	}
};

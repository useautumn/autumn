import { cleanupOneOffCustomerProducts } from "@/internal/customers/cusProducts/actions/cleanupOneOff/cleanupOneOff.js";
import type { CronContext } from "../utils/CronContext.js";

export const runOneOffCleanup = async ({ ctx }: { ctx: CronContext }) => {
	try {
		const { cleanedUp } = await cleanupOneOffCustomerProducts({ ctx });
		ctx.logger.info(`Expired ${cleanedUp} depleted one-off customer products`);
		console.log(`Expired ${cleanedUp} depleted one-off customer products`);
	} catch (error) {
		console.error("[One-off Cleanup] Error:", error);
	}
};

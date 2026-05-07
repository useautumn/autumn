import { expireOneOffCustomerProducts } from "@/internal/customers/cusProducts/actions/expireOneOff/expireOneOff.js";
import type { CronContext } from "../utils/CronContext.js";

export const runOneOffExpiry = async ({ ctx }: { ctx: CronContext }) => {
	try {
		const { expired } = await expireOneOffCustomerProducts({ ctx });
		ctx.logger.info(`Expired ${expired} ended one-off customer products`);
		console.log(`Expired ${expired} ended one-off customer products`);
	} catch (error) {
		console.error("[One-off Expiry] Error:", error);
	}
};

import { expireOneOffCustomerProducts } from "@/internal/customers/cusProducts/actions/expireOneOff/expireOneOff.js";
import type { CronContext } from "../utils/CronContext.js";

export const runOneOffExpiry = async ({
	ctx,
	nowMs,
	internalCustomerIds,
}: {
	ctx: CronContext;
	nowMs?: number;
	internalCustomerIds?: string[];
}) => {
	try {
		const { expired } = await expireOneOffCustomerProducts({
			ctx,
			nowMs,
			internalCustomerIds,
		});
		ctx.logger.info(`Expired ${expired} ended one-off customer products`);
		console.log(`Expired ${expired} ended one-off customer products`);
	} catch (error) {
		console.error("[One-off Expiry] Error:", error);
	}
};

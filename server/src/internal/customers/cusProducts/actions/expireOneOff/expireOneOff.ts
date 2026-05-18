import type { CronContext } from "@/cron/utils/CronContext.js";
import { expireOneOffCustomerProductResults } from "../expireOneOffCustomerProductResults.js";
import { logOneOffCustomerProductResults } from "../logOneOffCustomerProductResults.js";
import type { OneOffCustomerProductResult } from "../oneOffCustomerProductResult.js";
import { getOneOffCustomerProductsToExpire } from "./getOneOffToExpire.js";

export type ExpireOneOffResult = {
	expired: number;
	results: OneOffCustomerProductResult[];
};

export const expireOneOffCustomerProducts = async ({
	ctx,
	nowMs,
	internalCustomerIds,
}: {
	ctx: CronContext;
	nowMs?: number;
	internalCustomerIds?: string[];
}): Promise<ExpireOneOffResult> => {
	const toExpire = await getOneOffCustomerProductsToExpire({
		ctx,
		nowMs,
		internalCustomerIds,
	});

	if (toExpire.length === 0) {
		ctx.logger.info("[One-off Expiry] No customer products to expire");
		return { expired: 0, results: [] };
	}

	logOneOffCustomerProductResults({
		logger: ctx.logger,
		results: toExpire,
		label: "One-off Expiry",
	});

	const expired = await expireOneOffCustomerProductResults({
		ctx,
		results: toExpire,
		source: "expireOneOffCustomerProducts",
	});

	return { expired, results: toExpire };
};

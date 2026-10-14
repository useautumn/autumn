import type { CronContext } from "@/cron/utils/CronContext.js";
import { expireOneOffCustomerProductResults } from "../expireOneOffCustomerProductResults.js";
import { logOneOffCustomerProductResults } from "../logOneOffCustomerProductResults.js";
import type { OneOffCustomerProductResult } from "../oneOffCustomerProductResult.js";
import {
	getOneOffCustomerProductsToCleanup,
} from "./getOneOffToCleanup.js";

export type CleanupOneOffResult = {
	cleanedUp: number;
	results: OneOffCustomerProductResult[];
};

export const cleanupOneOffCustomerProducts = async ({
	ctx,
}: {
	ctx: CronContext;
}): Promise<CleanupOneOffResult> => {
	const { logger } = ctx;

	const toCleanup = await getOneOffCustomerProductsToCleanup({ ctx });

	if (toCleanup.length === 0) {
		logger.info("[One-off Cleanup] No customer products to cleanup");
		return { cleanedUp: 0, results: [] };
	}

	logOneOffCustomerProductResults({
		logger,
		results: toCleanup,
		label: "One-off Cleanup",
	});

	const cleanedUp = await expireOneOffCustomerProductResults({
		ctx,
		results: toCleanup,
		source: "cleanupOneOffCustomerProducts",
	});

	return {
		cleanedUp,
		results: toCleanup,
	};
};

import type { Checkout } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";
import {
	getCheckoutCache,
	setCheckoutCache,
} from "@/external/redis/actions/autumnCheckoutCache/autumnCheckoutCache.js";
import { checkoutRepo } from "../repos/checkoutRepo";

export const getCheckoutFromCacheOrDb = async ({
	checkoutId,
	db,
}: {
	checkoutId: string;
	db: DrizzleCli;
}): Promise<Checkout | null> => {
	const cachedCheckout = await getCheckoutCache({ checkoutId });

	if (cachedCheckout) {
		return cachedCheckout;
	}

	const dbCheckout = await checkoutRepo.get({
		db,
		id: checkoutId,
	});

	if (!dbCheckout) {
		return null;
	}

	await setCheckoutCache({
		checkoutId,
		data: dbCheckout,
	});

	return dbCheckout;
};

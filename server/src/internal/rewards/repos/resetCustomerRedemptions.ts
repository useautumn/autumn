import { rewardRedemptions } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Delete all redemptions for one or more customers (used in tests) */
export const resetCustomerRedemptions = async ({
	db,
	internalCustomerId,
}: {
	db: DrizzleCli;
	internalCustomerId: string | string[];
}) => {
	const ids = Array.isArray(internalCustomerId)
		? internalCustomerId
		: [internalCustomerId];
	return await db
		.delete(rewardRedemptions)
		.where(inArray(rewardRedemptions.internal_customer_id, ids));
};

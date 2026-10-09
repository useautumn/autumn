import { customerProducts, type FullCusProduct } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const listFullCustomerProductsByIds = async ({
	db,
	customerProductIds,
}: {
	db: DrizzleCli;
	customerProductIds: string[];
}): Promise<FullCusProduct[]> => {
	if (customerProductIds.length === 0) return [];

	const rows = await db.query.customerProducts.findMany({
		where: inArray(customerProducts.id, customerProductIds),
		with: {
			product: true,
			customer_entitlements: {
				with: {
					entitlement: { with: { feature: true } },
					replaceables: true,
					rollovers: true,
				},
			},
			customer_prices: { with: { price: true } },
			free_trial: true,
		},
	});
	return rows as FullCusProduct[];
};

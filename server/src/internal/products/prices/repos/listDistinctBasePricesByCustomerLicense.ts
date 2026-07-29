import {
	ACTIVE_STATUSES,
	customerPrices,
	customerProducts,
	type Price,
	prices,
} from "@autumn/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";
import { composeBasePriceCondition } from "./utils/composeBasePriceCondition";

export const listDistinctBasePricesByCustomerLicense = async ({
	db,
	customerLicenseLinkId,
	limit,
}: {
	db: DrizzleCli;
	customerLicenseLinkId: string;
	limit: number;
}): Promise<Price[]> => {
	const rows = await db
		.selectDistinct({ price: prices })
		.from(customerPrices)
		.innerJoin(
			customerProducts,
			eq(customerPrices.customer_product_id, customerProducts.id),
		)
		.innerJoin(prices, eq(customerPrices.price_id, prices.id))
		.where(
			and(
				eq(customerProducts.customer_license_link_id, customerLicenseLinkId),
				inArray(customerProducts.status, ACTIVE_STATUSES),
				composeBasePriceCondition(),
			),
		)
		.orderBy(asc(prices.id))
		.limit(limit);

	return rows.map(({ price }) => price) as Price[];
};

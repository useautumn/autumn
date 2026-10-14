import { ACTIVE_STATUSES, customerProducts } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

export const getByExternalIds = async ({
	db,
	internalCustomerId,
	externalIds,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	externalIds: string[];
}) => {
	if (externalIds.length === 0) return [];

	return db
		.select({
			id: customerProducts.id,
			external_id: customerProducts.external_id,
		})
		.from(customerProducts)
		.where(
			and(
				eq(customerProducts.internal_customer_id, internalCustomerId),
				inArray(customerProducts.external_id, externalIds),
				inArray(customerProducts.status, ACTIVE_STATUSES),
			),
		);
};

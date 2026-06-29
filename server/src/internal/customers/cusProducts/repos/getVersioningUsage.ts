import {
	customerProducts,
	VERSIONABLE_CUSTOMER_STATUSES,
} from "@autumn/shared";
import { countDistinct, inArray, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type CustomerProductVersioningUsage = {
	hasAnyCustomerProducts: boolean;
	hasVersionableCustomerProducts: boolean;
	versionableCustomerCount: number;
};

const emptyUsage = (): CustomerProductVersioningUsage => ({
	hasAnyCustomerProducts: false,
	hasVersionableCustomerProducts: false,
	versionableCustomerCount: 0,
});

export const getVersioningUsage = async ({
	db,
	internalProductIds,
}: {
	db: DrizzleCli;
	internalProductIds: string[];
}): Promise<Map<string, CustomerProductVersioningUsage>> => {
	const usage = new Map(
		internalProductIds.map((internalProductId) => [
			internalProductId,
			emptyUsage(),
		]),
	);
	if (internalProductIds.length === 0) return usage;

	const result = await db
		.select({
			internalProductId: customerProducts.internal_product_id,
			anyCount: countDistinct(customerProducts.id).as("any_count"),
			versionableCount: countDistinct(
				sql`CASE WHEN ${inArray(customerProducts.status, VERSIONABLE_CUSTOMER_STATUSES)} THEN ${customerProducts.id} END`,
			).as("versionable_count"),
		})
		.from(customerProducts)
		.where(inArray(customerProducts.internal_product_id, internalProductIds))
		.groupBy(customerProducts.internal_product_id);

	for (const row of result) {
		usage.set(row.internalProductId, {
			hasAnyCustomerProducts: Number(row.anyCount) > 0,
			hasVersionableCustomerProducts: Number(row.versionableCount) > 0,
			versionableCustomerCount: Number(row.versionableCount),
		});
	}

	return usage;
};

export const getVersioningUsageForProduct = async ({
	db,
	internalProductId,
}: {
	db: DrizzleCli;
	internalProductId: string;
}): Promise<CustomerProductVersioningUsage> => {
	const usageByProduct = await getVersioningUsage({
		db,
		internalProductIds: [internalProductId],
	});

	return usageByProduct.get(internalProductId) ?? emptyUsage();
};

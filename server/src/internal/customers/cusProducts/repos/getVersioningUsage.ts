import {
	customerEntitlements,
	customerPrices,
	customerProducts,
	entitlements,
	prices,
	VERSIONABLE_CUSTOMER_STATUSES,
} from "@autumn/shared";
import { and, countDistinct, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type CustomerProductVersioningUsage = {
	hasAnyCustomerProducts: boolean;
	hasVersionableCustomerProducts: boolean;
	versionableCustomerCount: number;
	/** This version's ent/price ids are referenced by a versionable cus_ent/cus_price. */
	hasVersionableRowRefs: boolean;
};

const emptyUsage = (): CustomerProductVersioningUsage => ({
	hasAnyCustomerProducts: false,
	hasVersionableCustomerProducts: false,
	versionableCustomerCount: 0,
	hasVersionableRowRefs: false,
});

const hasVersionableEntitlementRef = async ({
	db,
	internalProductId,
}: {
	db: DrizzleCli;
	internalProductId: string;
}): Promise<boolean> => {
	const [row] = await db
		.select({ internalProductId: entitlements.internal_product_id })
		.from(customerEntitlements)
		.innerJoin(
			entitlements,
			eq(customerEntitlements.entitlement_id, entitlements.id),
		)
		.innerJoin(
			customerProducts,
			eq(customerEntitlements.customer_product_id, customerProducts.id),
		)
		.where(
			and(
				eq(entitlements.internal_product_id, internalProductId),
				inArray(customerProducts.status, VERSIONABLE_CUSTOMER_STATUSES),
			),
		)
		.limit(1);

	return row != null;
};

const hasVersionablePriceRef = async ({
	db,
	internalProductId,
}: {
	db: DrizzleCli;
	internalProductId: string;
}): Promise<boolean> => {
	const [row] = await db
		.select({ internalProductId: prices.internal_product_id })
		.from(customerPrices)
		.innerJoin(prices, eq(customerPrices.price_id, prices.id))
		.innerJoin(
			customerProducts,
			eq(customerPrices.customer_product_id, customerProducts.id),
		)
		.where(
			and(
				eq(prices.internal_product_id, internalProductId),
				inArray(customerProducts.status, VERSIONABLE_CUSTOMER_STATUSES),
			),
		)
		.limit(1);

	return row != null;
};

/** Product versions whose entitlement/price rows are still referenced by a versionable customer. */
const internalProductIdsWithVersionableRowRefs = async ({
	db,
	internalProductIds,
}: {
	db: DrizzleCli;
	internalProductIds: string[];
}): Promise<Set<string>> => {
	const hits = await Promise.all(
		internalProductIds.map(async (internalProductId) => {
			if (await hasVersionableEntitlementRef({ db, internalProductId })) {
				return internalProductId;
			}
			if (await hasVersionablePriceRef({ db, internalProductId })) {
				return internalProductId;
			}
			return null;
		}),
	);

	return new Set(hits.filter((id) => id != null));
};

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

	const [result, rowRefIds] = await Promise.all([
		db
			.select({
				internalProductId: customerProducts.internal_product_id,
				anyCount: countDistinct(customerProducts.id).as("any_count"),
				versionableCount: countDistinct(
					sql`CASE WHEN ${inArray(customerProducts.status, VERSIONABLE_CUSTOMER_STATUSES)} THEN ${customerProducts.id} END`,
				).as("versionable_count"),
			})
			.from(customerProducts)
			.where(inArray(customerProducts.internal_product_id, internalProductIds))
			.groupBy(customerProducts.internal_product_id),
		internalProductIdsWithVersionableRowRefs({ db, internalProductIds }),
	]);

	for (const row of result) {
		usage.set(row.internalProductId, {
			hasAnyCustomerProducts: Number(row.anyCount) > 0,
			hasVersionableCustomerProducts: Number(row.versionableCount) > 0,
			versionableCustomerCount: Number(row.versionableCount),
			hasVersionableRowRefs: rowRefIds.has(row.internalProductId),
		});
	}

	for (const internalProductId of rowRefIds) {
		const current = usage.get(internalProductId) ?? emptyUsage();
		usage.set(internalProductId, {
			...current,
			hasVersionableRowRefs: true,
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

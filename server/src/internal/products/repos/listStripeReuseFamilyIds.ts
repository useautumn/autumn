import { type AppEnv, products } from "@autumn/shared";
import { and, desc, eq, exists, inArray, ne, or, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type StripeReuseFamilyId = {
	baseInternalProductId: string;
	productId: string;
};

const familyFilter = ({
	orgId,
	env,
	baseInternalProductIds,
}: {
	orgId: string;
	env: AppEnv;
	baseInternalProductIds: string[];
}) =>
	and(
		eq(products.org_id, orgId),
		eq(products.env, env),
		ne(products.archived, true),
		or(
			inArray(products.internal_id, baseInternalProductIds),
			inArray(products.base_internal_product_id, baseInternalProductIds),
		),
	);

export const listStripeReuseFamilyIds = async ({
	db,
	orgId,
	env,
	baseInternalProductIds,
	returnAll = false,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	baseInternalProductIds: string[];
	returnAll?: boolean;
}): Promise<StripeReuseFamilyId[]> => {
	const uniqueBaseInternalProductIds = [...new Set(baseInternalProductIds)];
	if (uniqueBaseInternalProductIds.length === 0) return [];

	const latestVersionsSubquery = db
		.select({
			id: products.id,
			maxVersion: sql<number>`MAX(${products.version})`.as("max_version"),
		})
		.from(products)
		.where(
			familyFilter({
				orgId,
				env,
				baseInternalProductIds: uniqueBaseInternalProductIds,
			}),
		)
		.groupBy(products.id)
		.as("latest_versions");

	const rows = await db
		.select({
			baseInternalProductId:
				sql<string>`COALESCE(${products.base_internal_product_id}, ${products.internal_id})`,
			productId: products.id,
		})
		.from(products)
		.where(
			and(
				familyFilter({
					orgId,
					env,
					baseInternalProductIds: uniqueBaseInternalProductIds,
				}),
				returnAll
					? undefined
					: exists(
							db
								.select()
								.from(latestVersionsSubquery)
								.where(
									and(
										eq(latestVersionsSubquery.id, products.id),
										eq(latestVersionsSubquery.maxVersion, products.version),
									),
								),
						),
			),
		)
		.orderBy(desc(products.version));

	const seen = new Set<string>();
	return rows.filter((row) => {
		const key = `${row.baseInternalProductId}:${row.productId}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

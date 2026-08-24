import {
	type AppEnv,
	customerProducts,
	customers,
	VERSIONABLE_CUSTOMER_STATUSES,
} from "@autumn/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/**
 * EXISTS: a live Vercel-installed customer sits on this product version.
 * `->>` (not `->`) is required so Postgres uses idx_customers_processors_vercel;
 * `->` has no stats and walks the plan's cusProduct rows instead.
 */
export const hasVercelCustomerOnProductQuery = ({
	db,
	orgId,
	env,
	internalProductId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalProductId: string;
}) =>
	db
		.select({ id: customerProducts.id })
		.from(customers)
		.innerJoin(
			customerProducts,
			eq(customerProducts.internal_customer_id, customers.internal_id),
		)
		.where(
			and(
				eq(customers.org_id, orgId),
				eq(customers.env, env),
				sql`${customers.processors} ->> 'vercel' IS NOT NULL`,
				eq(customerProducts.internal_product_id, internalProductId),
				inArray(customerProducts.status, VERSIONABLE_CUSTOMER_STATUSES),
			),
		)
		.limit(1);

export const hasVercelCustomerOnProduct = async ({
	db,
	orgId,
	env,
	internalProductIds,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalProductIds: string[];
}): Promise<boolean> => {
	if (internalProductIds.length === 0) return false;

	const hits = await Promise.all(
		internalProductIds.map(async (internalProductId) => {
			const [row] = await hasVercelCustomerOnProductQuery({
				db,
				orgId,
				env,
				internalProductId,
			});
			return row != null;
		}),
	);

	return hits.some(Boolean);
};

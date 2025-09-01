import {
	type AppEnv,
	CusProductStatus,
	customerProducts,
	products,
} from "@autumn/shared";
import {
	and,
	count,
	countDistinct,
	eq,
	inArray,
	isNotNull,
	sql,
} from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const activeStatuses = [CusProductStatus.Active, CusProductStatus.PastDue];
export class CusProdReadService {
	static async existsForProduct({
		db,
		internalProductId,
		productId,
	}: {
		db: DrizzleCli;
		internalProductId?: string;
		productId?: string;
	}) {
		const result = await db
			.select({
				id: customerProducts.id,
			})
			.from(customerProducts)
			.where(
				and(
					productId ? eq(customerProducts.product_id, productId) : undefined,
					internalProductId
						? eq(customerProducts.internal_product_id, internalProductId)
						: undefined,
				),
			)
			.limit(1);

		return result.length > 0;
	}

	static getCounts = async ({
		db,
		internalProductId,
	}: {
		db: DrizzleCli;
		internalProductId: string;
	}) => {
		const result = await db
			.select({
				active: countDistinct(
					sql`CASE WHEN ${inArray(customerProducts.status, activeStatuses)} THEN ${customerProducts.internal_customer_id} END`,
				).as("active"),
				canceled: count(
					sql`CASE WHEN ${isNotNull(customerProducts.canceled_at)} AND ${inArray(customerProducts.status, activeStatuses)} THEN 1 END`,
				).as("canceled"),
				custom: count(
					sql`CASE WHEN ${eq(customerProducts.is_custom, true)} AND ${inArray(customerProducts.status, activeStatuses)} THEN 1 END`,
				).as("custom"),
				trialing: count(
					sql`CASE WHEN ${isNotNull(customerProducts.trial_ends_at)} AND ${sql`${customerProducts.trial_ends_at} > (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint`} AND ${inArray(customerProducts.status, activeStatuses)} THEN 1 END`,
				).as("trialing"),
				all: countDistinct(customerProducts.internal_customer_id).as("all"),
			})
			.from(customerProducts)
			.where(eq(customerProducts.internal_product_id, internalProductId));

		return result[0];
	};

	static async getCountsForAllVersions({
		db,
		productId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		productId: string;
		orgId: string;
		env: AppEnv;
	}) {
		const internalProductIds = await db
			.select({
				internal_id: products.internal_id,
			})
			.from(products)
			.where(
				and(
					eq(products.id, productId),
					eq(products.org_id, orgId),
					eq(products.env, env),
				),
			);

		const internalProductIdsArray = internalProductIds.map(
			(item) => item.internal_id,
		);

		const result = await db
			.select({
				active: countDistinct(
					sql`CASE WHEN ${inArray(customerProducts.status, activeStatuses)} THEN ${customerProducts.internal_customer_id} END`,
				).as("active"),
				canceled: count(
					sql`CASE WHEN ${isNotNull(customerProducts.canceled_at)} AND ${inArray(customerProducts.status, activeStatuses)} THEN 1 END`,
				).as("canceled"),
				custom: count(
					sql`CASE WHEN ${eq(customerProducts.is_custom, true)} AND ${inArray(customerProducts.status, activeStatuses)} THEN 1 END`,
				).as("custom"),
				trialing: count(
					sql`CASE WHEN ${isNotNull(customerProducts.trial_ends_at)} AND ${sql`${customerProducts.trial_ends_at} > (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint`} AND ${inArray(customerProducts.status, activeStatuses)} THEN 1 END`,
				).as("trialing"),
				all: countDistinct(customerProducts.internal_customer_id).as("all"),
			})
			.from(customerProducts)
			.where(
				inArray(customerProducts.internal_product_id, internalProductIdsArray),
			);

		return result[0];
	}
}

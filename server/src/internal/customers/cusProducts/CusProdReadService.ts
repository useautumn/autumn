import {
	type AppEnv,
	CusProductStatus,
	customerProducts,
	products,
} from "@autumn/shared";
import { and, countDistinct, eq, inArray, isNotNull, sql } from "drizzle-orm";
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
				active: countDistinct(customerProducts.internal_customer_id).as(
					"active",
				),
				canceled: countDistinct(
					sql`CASE WHEN ${isNotNull(customerProducts.canceled_at)} THEN ${customerProducts.internal_customer_id} END`,
				).as("canceled"),
				custom: countDistinct(
					sql`CASE WHEN ${eq(customerProducts.is_custom, true)} THEN ${customerProducts.internal_customer_id} END`,
				).as("custom"),
				trialing: countDistinct(
					sql`CASE WHEN ${isNotNull(customerProducts.trial_ends_at)} AND ${sql`${customerProducts.trial_ends_at} > (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint`} THEN ${customerProducts.internal_customer_id} END`,
				).as("trialing"),
				all: countDistinct(customerProducts.internal_customer_id).as("all"),
			})
			.from(customerProducts)
			.where(
				and(
					eq(customerProducts.internal_product_id, internalProductId),
					inArray(customerProducts.status, activeStatuses),
				),
			);

		return result[0];
	};

	static async getCountsForAllProductsInOrg({
		db,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
	}) {
		const rows = await db
			.select({
				productId: products.id,
				active: countDistinct(customerProducts.internal_customer_id).as(
					"active",
				),
				canceled: countDistinct(
					sql`CASE WHEN ${isNotNull(customerProducts.canceled_at)} THEN ${customerProducts.internal_customer_id} END`,
				).as("canceled"),
				custom: countDistinct(
					sql`CASE WHEN ${eq(customerProducts.is_custom, true)} THEN ${customerProducts.internal_customer_id} END`,
				).as("custom"),
				trialing: countDistinct(
					sql`CASE WHEN ${isNotNull(customerProducts.trial_ends_at)} AND ${sql`${customerProducts.trial_ends_at} > (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint`} THEN ${customerProducts.internal_customer_id} END`,
				).as("trialing"),
				all: countDistinct(customerProducts.internal_customer_id).as("all"),
			})
			.from(products)
			.leftJoin(
				customerProducts,
				and(
					eq(customerProducts.internal_product_id, products.internal_id),
					inArray(customerProducts.status, activeStatuses),
				),
			)
			.where(and(eq(products.org_id, orgId), eq(products.env, env)))
			.groupBy(products.id);

		const result: Record<
			string,
			{
				active: number;
				canceled: number;
				custom: number;
				trialing: number;
				all: number;
			}
		> = {};
		for (const row of rows) {
			result[row.productId] = {
				active: row.active,
				canceled: row.canceled,
				custom: row.custom,
				trialing: row.trialing,
				all: row.all,
			};
		}
		return result;
	}

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
				active: countDistinct(customerProducts.internal_customer_id).as(
					"active",
				),
				canceled: countDistinct(
					sql`CASE WHEN ${isNotNull(customerProducts.canceled_at)} THEN ${customerProducts.internal_customer_id} END`,
				).as("canceled"),
				custom: countDistinct(
					sql`CASE WHEN ${eq(customerProducts.is_custom, true)} THEN ${customerProducts.internal_customer_id} END`,
				).as("custom"),
				trialing: countDistinct(
					sql`CASE WHEN ${isNotNull(customerProducts.trial_ends_at)} AND ${sql`${customerProducts.trial_ends_at} > (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint`} THEN ${customerProducts.internal_customer_id} END`,
				).as("trialing"),
				all: countDistinct(customerProducts.internal_customer_id).as("all"),
			})
			.from(customerProducts)
			.where(
				and(
					inArray(
						customerProducts.internal_product_id,
						internalProductIdsArray,
					),
					inArray(customerProducts.status, activeStatuses),
				),
			);

		return result[0];
	}
}

import {
	AffectedResource,
	ErrCode,
	entitlements,
	products,
	RecaseError,
} from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { FeatureService } from "../FeatureService.js";

export const handleGetFeatureDeletionInfo = createRoute({
	resource: AffectedResource.Feature,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { feature_id } = c.req.param();

		const feature = await FeatureService.get({
			db: ctx.db,
			id: feature_id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		if (!feature) {
			throw new RecaseError({
				message: "Feature not found",
				code: ErrCode.FeatureNotFound,
				statusCode: 404,
			});
		}

		// Use Drizzle query similar to ProductService.getDeletionText
		const res_data = await ctx.db
			.select({
				productName: sql<string>`CASE WHEN ROW_NUMBER() OVER (ORDER BY ${products.created_at}) = 1 THEN ${products.name ?? "Product name not found"} ELSE NULL END`,
				totalCount: sql<number>`COUNT(*) OVER ()`,
			})
			.from(products)
			.innerJoin(
				entitlements,
				eq(products.internal_id, entitlements.internal_product_id),
			)
			.where(
				and(
					eq(entitlements.internal_feature_id, feature.internal_id!),
					eq(products.env, ctx.env),
					eq(products.org_id, ctx.org.id),
				),
			)
			.limit(1);

		console.log(
			`Feature ${feature_id} has ${res_data.length} products. First product name: ${res_data[0]?.productName}`,
		);

		// If no products found, return explicit zero count
		if (!res_data || res_data.length === 0) {
			return c.json({
				productName: null,
				totalCount: 0,
			});
		}

		return c.json({
			productName: res_data[0]?.productName || null,
			totalCount: Number(res_data[0]?.totalCount) || 0,
		});
	},
});

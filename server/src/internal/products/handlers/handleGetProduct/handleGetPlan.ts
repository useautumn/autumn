import {
	AffectedResource,
	type ApiPlanV1,
	applyResponseVersionChanges,
	ErrCode,
	ProductNotFoundError,
	RecaseError,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

const GetProductQuerySchema = z.object({
	schemaVersion: z.string().optional(),
});

/**
 * Route: GET /products/:product_id - Get a product by ID
 */
export const handleGetPlan = createRoute({
	query: GetProductQuerySchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const productId = c.req.param("product_id");
		const query = c.req.valid("query");

		const { db, org, env, apiVersion, features } = ctx;

		if (!productId) {
			throw new RecaseError({
				message: "Product ID is required",
				code: ErrCode.InvalidRequest,
			});
		}

		const product = await ProductService.getFull({
			db,
			orgId: org.id,
			env,
			idOrInternalId: productId,
		});

		if (!product) {
			throw new ProductNotFoundError({ productId: productId });
		}

		const schemaVersionInt = query.schemaVersion
			? Number.parseInt(query.schemaVersion)
			: 2;

		if (schemaVersionInt === 1) return c.json(product);

		const planResponse = await getPlanResponse({
			product,
			features,
		});

		const versionedResponse = applyResponseVersionChanges<ApiPlanV1>({
			input: planResponse,
			targetVersion: apiVersion,
			resource: AffectedResource.Product,
			legacyData: {
				features: ctx.features,
			},
			ctx,
		});

		return c.json(versionedResponse);
	},
});

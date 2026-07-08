import {
	AffectedResource,
	type ApiPlanV1,
	applyResponseVersionChanges,
	ErrCode,
	ProductNotFoundError,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { loadApiPlanLicenses } from "@/internal/licenses/actions/links/loadApiPlanLicenses.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

const GetProductQuerySchema = z.object({
	schemaVersion: z.string().optional(),
});

/**
 * Route: GET /products/:product_id - Get a product by ID
 */
export const handleGetPlanV1 = createRoute({
	scopes: [Scopes.Plans.Read],
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

		const planLicensesByParent = await loadApiPlanLicenses({
			ctx,
			internalProductIds: [product.internal_id],
		});
		const planResponse = await getPlanResponse({
			ctx,
			product,
			features,
			planLicenses: planLicensesByParent.get(product.internal_id),
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

import { mapToProductV2, queryInteger } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ProductService } from "../ProductService.js";

const GetProductInternalQuerySchema = z.object({
	version: queryInteger().optional(),
});

export const handleGetProductInternal = createRoute({
	query: GetProductInternalQuerySchema,
	handler: async (c) => {
		const { productId } = c.req.param();
		const { version } = c.req.valid("query");
		const { db, org, env, features } = c.get("ctx");

		const [product, latestProduct] = await Promise.all([
			ProductService.getFull({
				db,
				idOrInternalId: productId,
				orgId: org.id,
				env,
				version: version,
			}),
			ProductService.getFull({
				db,
				idOrInternalId: productId,
				orgId: org.id,
				env,
			}),
		]);

		const productV2 = mapToProductV2({
			product: product,
			features: features,
		});

		return c.json({ product: productV2, numVersions: latestProduct.version });
	},
});

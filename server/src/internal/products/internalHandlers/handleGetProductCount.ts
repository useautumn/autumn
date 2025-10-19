import { ProductNotFoundError } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import { ProductService } from "@/internal/products/ProductService.js";

const GetProductCountQuerySchema = z.object({
	version: z.coerce.number().optional(),
});

/**
 * GET /products/:productId/count
 * Get customer counts for a specific product version
 */
export const handleGetProductCount = createRoute({
	query: GetProductCountQuerySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { productId } = c.req.param();
		const { version } = c.req.valid("query");

		const product = await ProductService.get({
			db: ctx.db,
			id: productId,
			orgId: ctx.org.id,
			env: ctx.env,
			version: version,
		});

		if (!product) {
			throw new ProductNotFoundError({ productId, version });
		}

		// Get counts from postgres
		const counts = await CusProdReadService.getCounts({
			db: ctx.db,
			internalProductId: product.internal_id,
		});

		return c.json(counts);
	},
});

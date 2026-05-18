import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { ProductService } from "@/internal/products/ProductService";
import { mapToProductV2 } from "@/internal/products/productV2Utils";

const GetProductsByPriceIdsQuerySchema = z.object({
	// qs (with comma:true) parses `?ids=a,b` as ["a","b"] and `?ids=a` as "a".
	ids: z.union([z.string(), z.array(z.string())]),
});

/**
 * GET /products/products/by-price-ids?ids=p1,p2
 * Returns the (possibly historical) product versions that own the given
 * price IDs. Used by the reward update sheet to resolve price IDs whose
 * owning product version isn't in the latest-versions list.
 */
export const handleGetProductsByPriceIds = createRoute({
	scopes: [Scopes.Plans.Read],
	query: GetProductsByPriceIdsQuerySchema,
	handler: async (c) => {
		const { db, org, env, features, logger } = c.get("ctx");
		const { ids } = c.req.valid("query");

		const priceIds = (Array.isArray(ids) ? ids : [ids])
			.map((id) => id.trim())
			.filter(Boolean);

		logger.info("[byPriceIds] request", {
			data: JSON.stringify({
				orgId: org.id,
				env,
				priceIds,
			}),
		});

		const products = await ProductService.listByPriceIds({
			db,
			orgId: org.id,
			env,
			priceIds,
		});

		logger.info("[byPriceIds] result", {
			data: JSON.stringify({
				priceIds,
				productCount: products.length,
				productSample: products.slice(0, 2).map((p) => ({
					id: p.id,
					internal_id: p.internal_id,
					version: p.version,
					priceIds: p.prices.map((pr) => pr.id),
				})),
			}),
		});

		return c.json({
			products: products.map((p) => mapToProductV2({ product: p, features })),
		});
	},
});

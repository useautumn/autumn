import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService";
import { ProductService } from "@/internal/products/ProductService";

/**
 * GET /products/product_counts
 * Used by: vite/src/hooks/queries/useProductsQuery.tsx
 */
export const handleGetProductCounts = createRoute({
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");

		const products = await ProductService.listFull({
			db,
			orgId: org.id,
			env: env,
		});

		const counts = await Promise.all(
			products.map(async (product) => {
				return CusProdReadService.getCountsForAllVersions({
					db,
					productId: product.id,
					orgId: org.id,
					env: env,
				});
			}),
		);

		const result: {
			[key: string]: {
				active: number;
				canceled: number;
				custom: number;
				trialing: number;
				all: number;
			};
		} = {};
		for (let i = 0; i < products.length; i++) {
			if (!result[products[i].id]) {
				result[products[i].id] = counts[i];
			}
		}

		return c.json(result);
	},
});

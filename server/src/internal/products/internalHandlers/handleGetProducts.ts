import { createRoute } from "@/honoMiddlewares/routeHandler";
import { ProductService } from "@/internal/products/ProductService";
import { getGroupToDefaults } from "@/internal/products/productUtils";
import { sortFullProducts } from "@/internal/products/productUtils/sortProductUtils";
import { mapToProductV2 } from "@/internal/products/productV2Utils";
import { queryWithCache } from "@/utils/cacheUtils/queryWithCache";
import {
	buildProductsCacheKey,
	PRODUCTS_CACHE_TTL,
} from "../productCacheUtils";

/**
 * GET /products/products
 * Used by:
 * - vite/src/hooks/queries/useProductsQuery.tsx
 * - vite/src/views/onboarding4/hooks/useOnboardingProgress.tsx
 */
export const handleGetProducts = createRoute({
	handler: async (c) => {
		const { db, org, env, features } = c.get("ctx");

		const products = await queryWithCache({
			key: buildProductsCacheKey({ orgId: org.id, env, queryParams: {} }),
			ttl: PRODUCTS_CACHE_TTL,
			fn: async () => {
				const prods = await ProductService.listFull({
					db,
					orgId: org.id,
					env: env,
				});
				sortFullProducts({ products: prods });
				return prods;
			},
		});

		const groupToDefaults = getGroupToDefaults({
			defaultProds: products,
		});

		return c.json({
			products: products.map((p) =>
				mapToProductV2({ product: p, features: features }),
			),
			groupToDefaults,
		});
	},
});

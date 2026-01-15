import { createRoute } from "@/honoMiddlewares/routeHandler";
import { ProductService } from "@/internal/products/ProductService";
import { getGroupToDefaults } from "@/internal/products/productUtils";
import { sortFullProducts } from "@/internal/products/productUtils/sortProductUtils";
import { mapToProductV2 } from "@/internal/products/productV2Utils";

/**
 * GET /products/products
 * Used by:
 * - vite/src/hooks/queries/useProductsQuery.tsx
 * - vite/src/views/onboarding4/hooks/useOnboardingProgress.tsx
 */
export const handleGetProducts = createRoute({
	handler: async (c) => {
		const { db, org, env, features } = c.get("ctx");
		let products = await ProductService.listFull({
			db,
			orgId: org.id,
			env: env,
		});

		if (process.env.NODE_ENV === "development") {
			products = products.slice(0, 10);
		}

		sortFullProducts({ products });

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

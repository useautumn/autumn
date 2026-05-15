import { createRoute } from "@/honoMiddlewares/routeHandler";
import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { ProductService } from "@/internal/products/ProductService";
import { getGroupToDefaults } from "@/internal/products/productUtils";
import { mapToProductV2 } from "@/internal/products/productV2Utils";

const GetProductsQuerySchema = z.object({
	all_versions: z.boolean().default(false),
});

/**
 * GET /products/products
 * Used by:
 * - vite/src/hooks/queries/useProductsQuery.tsx
 * - vite/src/views/onboarding4/hooks/useOnboardingProgress.tsx
 */
export const handleGetProducts = createRoute({
	scopes: [Scopes.Plans.Read],
	query: GetProductsQuerySchema,
	handler: async (c) => {
		const { db, org, env, features } = c.get("ctx");
		const { all_versions } = c.req.valid("query");

		const products = await ProductService.listFull({
			db,
			orgId: org.id,
			env,
			returnAll: all_versions,
		});

		// `groupToDefaults` only cares about the latest version of each plan; if
		// we're returning every version, compute defaults from the latest set.
		const defaultProds = all_versions
			? await ProductService.listFull({ db, orgId: org.id, env })
			: products;
		const groupToDefaults = getGroupToDefaults({ defaultProds });

		return c.json({
			products: products.map((p) =>
				mapToProductV2({ product: p, features: features }),
			),
			groupToDefaults,
		});
	},
});

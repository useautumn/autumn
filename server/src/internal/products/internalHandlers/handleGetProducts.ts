import { createRoute } from "@/honoMiddlewares/routeHandler";
import { ProductCatalogType, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { PlanService } from "@/internal/products/PlanService";
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

		const products = await PlanService.listFull({
			db,
			orgId: org.id,
			env,
			returnAll: all_versions,
		});

		// `groupToDefaults` only cares about the latest version of each plan; if
		// we're returning every version, derive the latest set from the already-
		// fetched products to avoid a second round-trip.
		const defaultProds = all_versions
			? Object.values(
					products.reduce<Record<string, (typeof products)[0]>>((acc, p) => {
						if (!acc[p.id] || p.version > acc[p.id].version) acc[p.id] = p;
						return acc;
					}, {}),
				)
			: products;
		const groupToDefaults = getGroupToDefaults({ defaultProds });

		// Variants store base_internal_product_id pointing at a specific (often older)
		// version; resolve it to the stable public base id so the UI can group them.
		const allVersions = await PlanService.listCachedAllVersions({
			db,
			orgId: org.id,
			env,
		});
		const internalIdToPublicId = new Map(
			allVersions.map((p) => [p.internal_id, p.id]),
		);

		return c.json({
			products: products.map((p) => {
				const productV2 = mapToProductV2({ product: p, features });
				return {
					...productV2,
					base_id: p.base_internal_product_id
						? (internalIdToPublicId.get(p.base_internal_product_id) ?? null)
						: null,
				};
			}),
			groupToDefaults,
		});
	},
});

export const handleGetLicenseProducts = createRoute({
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
			catalogType: ProductCatalogType.License,
		});
		const allVersions = await ProductService.listCachedAllVersions({
			db,
			orgId: org.id,
			env,
			catalogType: ProductCatalogType.License,
		});
		const internalIdToPublicId = new Map(
			allVersions.map((p) => [p.internal_id, p.id]),
		);

		return c.json({
			products: products.map((p) => {
				const productV2 = mapToProductV2({ product: p, features });
				return {
					...productV2,
					base_id: p.base_internal_product_id
						? (internalIdToPublicId.get(p.base_internal_product_id) ?? null)
						: null,
				};
			}),
		});
	},
});

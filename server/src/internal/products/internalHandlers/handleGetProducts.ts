import {
	type AppEnv,
	type Feature,
	type FullProduct,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { ProductService } from "@/internal/products/ProductService";
import { getGroupToDefaults } from "@/internal/products/productUtils";
import { mapToProductV2 } from "@/internal/products/productV2Utils";

const GetProductsQuerySchema = z.object({
	all_versions: z.boolean().default(false),
});

/** Resolve a variant's base_internal_product_id to the stable public base id
 * so the UI can group a plan's variants together. */
const productsToV2WithBaseIds = async ({
	db,
	orgId,
	env,
	features,
	products,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	features: Feature[];
	products: FullProduct[];
}) => {
	const allVersions = await ProductService.listCachedAllVersions({
		db,
		orgId,
		env,
	});
	const internalIdToPublicId = new Map(
		allVersions.map((version) => [version.internal_id, version.id]),
	);

	return products.map((product) => ({
		...mapToProductV2({ product, features }),
		licenses: product.licenses,
		parent_plan_licenses: product.parent_plan_licenses,
		base_id: product.base_internal_product_id
			? (internalIdToPublicId.get(product.base_internal_product_id) ?? null)
			: null,
	}));
};

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

		return c.json({
			products: await productsToV2WithBaseIds({
				db,
				orgId: org.id,
				env,
				features,
				products,
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

		const links = await planLicenseRepo.listCatalogByOrgEnv({
			db,
			orgId: org.id,
			env,
		});
		const linkedInternalIds = new Set(
			links.map((link) => link.license_internal_product_id),
		);

		const products = await ProductService.listFull({
			db,
			orgId: org.id,
			env,
			returnAll: all_versions,
		});
		const linkedExternalIds = new Set(
			products
				.filter((product) => linkedInternalIds.has(product.internal_id))
				.map((product) => product.id),
		);
		const licenseProducts = products.filter((product) =>
			linkedExternalIds.has(product.id),
		);

		return c.json({
			products: await productsToV2WithBaseIds({
				db,
				orgId: org.id,
				env,
				features,
				products: licenseProducts,
			}),
		});
	},
});

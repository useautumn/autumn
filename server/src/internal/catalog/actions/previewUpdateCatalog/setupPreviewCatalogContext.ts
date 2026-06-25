import type { CatalogUpdateParams, FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import { ProductService } from "@/internal/products/ProductService.js";

export interface PreviewCatalogContext {
	/** Latest version of every product, for feature-usage lookups. */
	products: FullProduct[];
	/** Current product for each plan param (honoring a pinned version), or null if new. */
	currents: (FullProduct | null)[];
	/** Internal product ids that have at least one customer. */
	withCustomers: Set<string>;
}

/**
 * Batch the reads shared across the preview: the catalog (one cached listFull),
 * each plan's current product, and which products have customers.
 */
export const setupPreviewCatalogContext = async ({
	ctx,
	plans,
}: {
	ctx: AutumnContext;
	plans: CatalogUpdateParams["plans"];
}): Promise<PreviewCatalogContext> => {
	const { db, org, env } = ctx;

	const products = await ProductService.listFull({ db, orgId: org.id, env });
	const latestByPlanId = new Map(
		products.map((product) => [product.id, product]),
	);

	const currents = await Promise.all(
		plans.map((plan) => {
			const latest = latestByPlanId.get(plan.plan_id);
			if (plan.version !== undefined && latest?.version !== plan.version) {
				return ProductService.getFull({
					db,
					idOrInternalId: plan.plan_id,
					orgId: org.id,
					env,
					version: plan.version,
					allowNotFound: true,
				});
			}
			return latest ?? null;
		}),
	);

	const internalProductIds = currents
		.filter((current): current is FullProduct => current !== null)
		.map((current) => current.internal_id);
	const withCustomers = await CusProdReadService.existsForProducts({
		db,
		internalProductIds,
	});

	return { products, currents, withCustomers };
};

import type {
	CatalogPreviewUpdateResponse,
	CatalogUpdateParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { previewFeature } from "./previewFeature.js";
import { previewPlan } from "./previewPlan.js";
import { setupPreviewCatalogContext } from "./setupPreviewCatalogContext.js";

/**
 * Resolve a proposed catalog change (features + plans) WITHOUT persisting, so a
 * live preview matches what `catalog.update` would apply. Reads and the virtual
 * feature upsert are batched up front by setupPreviewCatalogContext.
 */
export const previewUpdateCatalog = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateParams;
}): Promise<CatalogPreviewUpdateResponse> => {
	const { plans } = params;
	const currency = ctx.org.default_currency ?? "usd";

	const { products, currents, withCustomers, proposedFeatures, planCtx } =
		await setupPreviewCatalogContext({ ctx, params });

	const [planResults, featureResults] = await Promise.all([
		Promise.all(
			plans.map((planParams, index) => {
				const current = currents[index];
				return previewPlan({
					ctx: planCtx,
					planParams,
					current,
					hasCustomers: current
						? withCustomers.has(current.internal_id)
						: false,
					currency,
				});
			}),
		),
		Promise.all(
			proposedFeatures.map(({ existing, dbFeature }) =>
				// Blockers are detected against the persisted catalog, so pass `ctx`.
				previewFeature({ ctx, dbFeature, existing, products }),
			),
		),
	]);

	return { plans: planResults, features: featureResults };
};

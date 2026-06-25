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
 * live preview matches what `catalog.update` would apply. Reads are batched up
 * front by setupPreviewCatalogContext to avoid N+1 round-trips.
 */
export const previewUpdateCatalog = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateParams;
}): Promise<CatalogPreviewUpdateResponse> => {
	const { features, plans } = params;
	const currency = ctx.org.default_currency ?? "usd";

	const { products, currents, withCustomers } =
		await setupPreviewCatalogContext({ ctx, plans });
	const featureById = new Map(
		ctx.features.map((feature) => [feature.id, feature]),
	);

	const [planResults, featureResults] = await Promise.all([
		Promise.all(
			plans.map((planParams, index) => {
				const current = currents[index];
				return previewPlan({
					ctx,
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
			features.map((featureParams) =>
				previewFeature({
					ctx,
					featureParams,
					existing: featureById.get(featureParams.feature_id) ?? null,
					products,
				}),
			),
		),
	]);

	return { plans: planResults, features: featureResults };
};

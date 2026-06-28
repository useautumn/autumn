import {
	type CatalogUpdateParams,
	type Feature,
	type FullProduct,
	featureV1ToDbFeature,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos/index.js";
import { ProductService } from "@/internal/products/ProductService.js";

type ProposedFeature = { existing: Feature | null; dbFeature: Feature };

export interface PreviewCatalogContext {
	/** Latest version of every product, for feature-usage lookups. */
	products: FullProduct[];
	/** Current product for each plan param (honoring a pinned version), or null if new. */
	currents: (FullProduct | null)[];
	/** Internal product ids that have at least one customer. */
	withCustomers: Set<string>;
	/** The batch's features resolved to DB shape, paired with what they replace. */
	proposedFeatures: ProposedFeature[];
	/** ctx with the batch's features virtually upserted, so plans can reference net-new ones. */
	planCtx: AutumnContext;
}

/**
 * Batch the reads shared across the preview (catalog via one cached listFull,
 * each plan's current product, which products have customers) and virtually
 * upsert the batch's features so plans resolve against them, mirroring
 * catalog.update's "features first, then plans" ordering.
 */
export const setupPreviewCatalogContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateParams;
}): Promise<PreviewCatalogContext> => {
	const { db, org, env } = ctx;
	const { features, plans } = params;

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
	const usageByProduct = await customerProductRepo.getVersioningUsage({
		db,
		internalProductIds,
	});
	const withCustomers = new Set(
		internalProductIds.filter(
			(internalProductId) =>
				usageByProduct.get(internalProductId)?.hasVersionableCustomerProducts,
		),
	);

	const featureById = new Map(
		ctx.features.map((feature) => [feature.id, feature]),
	);
	const proposedFeatures = features.map((featureParams) => {
		const existing = featureById.get(featureParams.feature_id) ?? null;
		const dbFeature = featureV1ToDbFeature({
			apiFeature: { id: featureParams.feature_id, ...featureParams },
			originalFeature: existing ?? undefined,
		});
		return { existing, dbFeature };
	});
	const proposedById = new Map(
		proposedFeatures.map(({ dbFeature }) => [dbFeature.id, dbFeature]),
	);
	const planCtx: AutumnContext = {
		...ctx,
		features: [
			...ctx.features.filter((feature) => !proposedById.has(feature.id)),
			...proposedById.values(),
		],
	};

	return { products, currents, withCustomers, proposedFeatures, planCtx };
};

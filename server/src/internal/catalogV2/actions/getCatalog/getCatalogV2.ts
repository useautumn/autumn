import {
	ApiVersionClass,
	dbToApiFeatureV1,
	type FullProduct,
	type GetCatalogParams,
	type GetCatalogResponse,
	LATEST_VERSION,
} from "@autumn/shared";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

const FEATURE_TARGET_VERSION = new ApiVersionClass(LATEST_VERSION);

/** Read the entire catalog — features plus latest top-level plans with variant/license edges. */
export const getCatalogV2 = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: GetCatalogParams;
}): Promise<GetCatalogResponse> => {
	const { include_archived = false } = params ?? {};

	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		archived: include_archived ? undefined : false,
	});

	// Variants surface only nested under their base plan, never top-level.
	const baseProducts = products.filter(
		(product) => !product.base_internal_product_id,
	);
	const pruneArchivedVariants = (product: FullProduct): FullProduct => ({
		...product,
		variants: (product.variants ?? []).filter(
			(variant) => include_archived || !variant.archived,
		),
	});

	// One read for the whole catalog: RC mappings live in their own table, keyed
	// by plan id with no version dimension.
	const revenuecatMappings = await RCMappingService.getAll({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const revenuecatByPlanId = new Map(
		revenuecatMappings.map((mapping) => [mapping.autumn_product_id, mapping]),
	);

	const plans = await Promise.all(
		baseProducts.map((product) =>
			getPlanResponse({
				ctx,
				product: pruneArchivedVariants(product),
				revenuecatMapping: revenuecatByPlanId.get(product.id),
				features: ctx.features,
				currency: ctx.org.default_currency || undefined,
				expandLicensePlans: true,
				expandVariants: true,
				resolveBaseFullProduct: false,
			}),
		),
	);

	const features = ctx.features.map((feature) =>
		dbToApiFeatureV1({
			ctx,
			dbFeature: feature,
			targetVersion: FEATURE_TARGET_VERSION,
		}),
	);

	return { features, plans };
};

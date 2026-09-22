import {
	type ApiPlanV1,
	ApiVersionClass,
	dbToApiFeatureV1,
	evaluateCatalogItemIdentity,
	type FullProduct,
	type GetCatalogParams,
	type GetCatalogResponse,
	LATEST_VERSION,
} from "@autumn/shared";
import { catalogVariantIdentity } from "@autumn/shared/api/catalogV2/planUpdate/params/catalogVariantParams.js";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	loadReferralProgramStates,
	loadRewardStates,
} from "@/internal/catalogV2/actions/updateCatalog/setup/loadRewardStates.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

const FEATURE_TARGET_VERSION = new ApiVersionClass(LATEST_VERSION);

const withItemMappingIdentities = <T extends Pick<ApiPlanV1, "items">>({
	plan,
}: {
	plan: T;
}) => ({
	...plan,
	items: plan.items.map((item) => ({
		...item,
		mapping_identity: JSON.stringify(evaluateCatalogItemIdentity({ item })),
	})),
});

/** Read the entire catalog — features plus latest top-level plans with variant/license edges. */
export const getCatalogV2 = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: GetCatalogParams;
}): Promise<GetCatalogResponse> => {
	const { include_archived = false, include_versions = false } = params ?? {};

	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		archived: include_archived ? undefined : false,
		returnAll: include_versions,
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
	// by plan id with no version dimension. Variants are their own products with
	// their own plan ids, so their rows are in here too — hand the whole map down
	// rather than a single row, or a variant's mapping can never be read back.
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
				revenuecatMappings: revenuecatByPlanId,
				features: ctx.features,
				currency: ctx.org.default_currency || undefined,
				expandLicensePlans: true,
				expandVariants: true,
				resolveBaseFullProduct: false,
			}),
		),
	);

	const features = ctx.features
		.filter((feature) => include_archived || !feature.archived)
		.map((feature) =>
			dbToApiFeatureV1({
				ctx,
				dbFeature: feature,
				targetVersion: FEATURE_TARGET_VERSION,
			}),
		);

	const loadedRewards = await loadRewardStates({ ctx });
	const { programs } = await loadReferralProgramStates({
		ctx,
		idByInternalId: loadedRewards.idByInternalId,
		statableInternalIds: loadedRewards.statableInternalIds,
	});

	return {
		features,
		plans: plans.map((plan) => ({
			...withItemMappingIdentities({ plan }),
			licenses: plan.licenses?.map((license) => ({
				...license,
				plan: license.plan
					? withItemMappingIdentities({ plan: license.plan })
					: undefined,
			})),
			variants: plan.variants?.map((variant) => ({
				...variant,
				mapping_identity: JSON.stringify(
					evaluateCatalogItemIdentity({
						item: variant,
						recipe: catalogVariantIdentity,
					}),
				),
				plan: variant.plan
					? withItemMappingIdentities({ plan: variant.plan })
					: undefined,
			})),
		})),
		rewards: loadedRewards.rewards.map((reward) =>
			reward.kind === "coupon"
				? { coupon: { ...reward.coupon, internal_id: reward.internalId } }
				: {
						feature_grant: {
							...reward.featureGrant,
							internal_id: reward.internalId,
						},
					},
		),
		referral_programs: programs.map((state) => ({
			...state.program,
			internal_id: state.internalId,
		})),
	};
};

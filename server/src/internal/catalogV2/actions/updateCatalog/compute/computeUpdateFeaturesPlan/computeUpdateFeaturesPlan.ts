import {
	ApiVersion,
	ApiVersionClass,
	dbToApiFeatureV1,
	diffFeatureV1,
	type Feature,
	isAnyCreditSystem,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeUpdateFeatureRewrites } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpdateFeaturesPlan/computeUpdateFeatureRewrites";
import { resolveFeatureUpdateEntry } from "@/internal/catalogV2/actions/updateCatalog/utils/featureUpdateUtils/resolveFeatureUpdateEntry";
import type { CatalogComputeStep } from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan";

const FEATURE_DIFF_VERSION = new ApiVersionClass(ApiVersion.V2_1);

const CREDIT_CONFIG_KEYS = [
	"credit_schema",
	"model_markups",
	"default_markup",
	"provider_markups",
] as const;

/** Batch entries matching an existing feature, resolved to current → next rows. */
export const computeUpdateFeaturesPlan = ({
	ctx,
	catalogContext,
	params,
}: {
	ctx: AutumnContext;
	catalogContext: UpdateCatalogContext;
	params: UpdateCatalogParams;
}): CatalogComputeStep => {
	const pendingCreditSystemConfigs = new Map<string, Feature["config"]>();

	const updateFeatures = params.features.flatMap((entry) => {
		const resolved = resolveFeatureUpdateEntry({
			features: ctx.features,
			entry,
		});

		if (!resolved) return [];

		const { current, next } = resolved;
		const state = catalogContext.featureStatesContext[current.id];

		const { previous_attributes: previousAttributes } = diffFeatureV1({
			from: dbToApiFeatureV1({
				ctx,
				dbFeature: current,
				targetVersion: FEATURE_DIFF_VERSION,
			}),
			to: dbToApiFeatureV1({
				ctx,
				dbFeature: next,
				targetVersion: FEATURE_DIFF_VERSION,
			}),
		});

		const rewrites = computeUpdateFeatureRewrites({
			current,
			next,
			state,
			pendingCreditSystemConfigs,
		});

		const creditConfigChanged = CREDIT_CONFIG_KEYS.some(
			(key) => previousAttributes?.[key] !== undefined,
		);

		return [
			{
				current,
				next,
				previousAttributes,
				hasCustomerEntitlements: state?.has_customers ?? false,
				regenerateDisplay: previousAttributes?.name !== undefined,
				clearCreditSystemCache:
					isAnyCreditSystem(current.type) && creditConfigChanged,
				rewrites,
			} satisfies UpdateFeaturePlan,
		];
	});

	return { updateFeatures };
};

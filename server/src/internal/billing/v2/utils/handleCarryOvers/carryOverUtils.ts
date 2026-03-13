import {
	type AttachParamsV1,
	deduplicateArray,
	type ExistingUsagesConfig,
	type Feature,
	type FullCusProduct,
	featureUtils,
	isBooleanFeature,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** Returns existing usages config overrides from carry_over_usages params. */
export const carryOverUsagesToExistingUsagesConfig = ({
	ctx,
	params,
	currentCustomerProduct,
}: {
	ctx: AutumnContext;
	params: AttachParamsV1;
	currentCustomerProduct: FullCusProduct;
}): ExistingUsagesConfig | undefined => {
	const carryOverUsages = params.carry_over_usages;
	if (!carryOverUsages?.enabled) return undefined;

	if (!carryOverUsages.feature_ids)
		return {
			fromCustomerProduct: currentCustomerProduct,
			carryAllConsumableFeatures: true,
		};

	const allConsumableFeatureIds = deduplicateArray(
		ctx.features
			.filter(
				(f: Feature) =>
					!isBooleanFeature({ feature: f }) && !featureUtils.isAllocated(f),
			)
			.map((feature) => feature.id),
	);

	const overrideFeatureIds = allConsumableFeatureIds.filter((id) =>
		carryOverUsages.feature_ids?.includes(id),
	);

	return {
		fromCustomerProduct: currentCustomerProduct,
		carryAllConsumableFeatures: false,
		consumableFeatureIdsToCarry: overrideFeatureIds,
	};
};

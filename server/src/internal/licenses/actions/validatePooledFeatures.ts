import {
	AllowanceType,
	type CreatePlanItemParamsV1,
	EntInterval,
	type FullProduct,
	Infinite,
	isAnyCreditSystem,
	isBooleanFeature,
	isFeaturePriceItem,
	type LicenseCustomize,
	type ProductItem,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

type PooledFeatureShape = {
	hasItem: boolean;
	perEntity: boolean;
	priced: boolean;
	unlimited: boolean;
	allowance: number | null;
	hasResetInterval: boolean;
	hasRollover: boolean;
};

const MISSING_SHAPE: PooledFeatureShape = {
	hasItem: false,
	perEntity: false,
	priced: false,
	unlimited: false,
	allowance: null,
	hasResetInterval: false,
	hasRollover: false,
};

const rejectPooledFeature = ({
	featureId,
	reason,
}: {
	featureId: string;
	reason: string;
}): never => {
	throw new RecaseError({
		message: `Feature ${featureId} cannot be pooled: ${reason}`,
	});
};

const POOLED_FEATURE_RULES: {
	invalid: (shape: PooledFeatureShape) => boolean;
	reason: string;
}[] = [
	{
		invalid: (shape) => !shape.hasItem,
		reason: "the license has no item for this feature",
	},
	{
		invalid: (shape) => shape.perEntity,
		reason: "per-entity items cannot be pooled",
	},
	{
		invalid: (shape) => shape.priced,
		reason: "priced items cannot be pooled",
	},
	{
		invalid: (shape) =>
			shape.unlimited || shape.allowance === null || shape.allowance <= 0,
		reason: "pooled items need a finite positive included amount",
	},
	{
		invalid: (shape) => !shape.hasResetInterval,
		reason: "pooled items need a reset interval",
	},
	{
		invalid: (shape) => shape.hasRollover,
		reason: "rollover is not supported on pooled items",
	},
];

const customizeItemToShape = (
	item: CreatePlanItemParamsV1,
): PooledFeatureShape => ({
	hasItem: true,
	perEntity: Boolean(item.entity_feature_id),
	priced: Boolean(item.price),
	unlimited: Boolean(item.unlimited),
	allowance: item.included ?? null,
	hasResetInterval: Boolean(item.reset?.interval),
	hasRollover: Boolean(item.rollover),
});

const productItemToShape = (item: ProductItem): PooledFeatureShape => ({
	hasItem: true,
	perEntity: Boolean(item.entity_feature_id),
	priced: isFeaturePriceItem(item),
	unlimited: item.included_usage === Infinite,
	allowance:
		typeof item.included_usage === "number" ? item.included_usage : null,
	hasResetInterval: Boolean(item.interval),
	hasRollover: Boolean(item.config?.rollover),
});

const productFeatureToShape = ({
	licenseProduct,
	featureId,
}: {
	licenseProduct: FullProduct;
	featureId: string;
}): PooledFeatureShape => {
	const entitlement = licenseProduct.entitlements.find(
		(candidate) => candidate.feature.id === featureId,
	);
	if (!entitlement) return MISSING_SHAPE;

	const priced = licenseProduct.prices.some(
		(price) =>
			"internal_feature_id" in price.config &&
			price.config.internal_feature_id === entitlement.internal_feature_id,
	);

	return {
		hasItem: true,
		perEntity: Boolean(entitlement.entity_feature_id),
		priced,
		unlimited: entitlement.allowance_type === AllowanceType.Unlimited,
		allowance: entitlement.allowance ?? null,
		hasResetInterval: Boolean(
			entitlement.interval && entitlement.interval !== EntInterval.Lifetime,
		),
		hasRollover: Boolean(entitlement.rollover),
	};
};

export const validatePooledFeatures = ({
	ctx,
	pooledFeatureIds,
	licenseProduct,
	customize,
	overrideItems,
}: {
	ctx: AutumnContext;
	pooledFeatureIds: string[];
	licenseProduct: FullProduct;
	customize?: LicenseCustomize | null;
	overrideItems?: ProductItem[];
}) => {
	if (pooledFeatureIds.length === 0) return;

	const customizeItemsByFeatureId = new Map(
		(customize?.items ?? []).map((item) => [item.feature_id, item]),
	);
	const overrideItemsByFeatureId = new Map(
		(overrideItems ?? []).map((item) => [item.feature_id, item]),
	);

	for (const featureId of pooledFeatureIds) {
		const feature = ctx.features.find(
			(candidate) => candidate.id === featureId,
		);
		if (!feature) {
			throw new RecaseError({
				message: `Feature ${featureId} cannot be pooled: feature not found`,
			});
		}
		if (isBooleanFeature({ feature }) || isAnyCreditSystem(feature.type)) {
			rejectPooledFeature({
				featureId,
				reason: "only metered features can be pooled",
			});
		}

		const customizeItem = customizeItemsByFeatureId.get(featureId);
		const overrideItem = overrideItemsByFeatureId.get(featureId);
		const resolveShape = (): PooledFeatureShape => {
			if (customizeItem) return customizeItemToShape(customizeItem);
			if (overrideItems) {
				return overrideItem ? productItemToShape(overrideItem) : MISSING_SHAPE;
			}
			return productFeatureToShape({ licenseProduct, featureId });
		};
		const shape = resolveShape();

		const failedRule = POOLED_FEATURE_RULES.find((rule) => rule.invalid(shape));
		if (failedRule) {
			rejectPooledFeature({ featureId, reason: failedRule.reason });
		}
	}
};

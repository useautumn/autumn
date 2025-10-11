import {
	type AppEnv,
	ErrCode,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type ProductItem,
	ProductItemFeatureType,
} from "@autumn/shared";
import { validateFeatureId } from "@/internal/features/featureUtils.js";
import {
	constructBooleanFeature,
	constructMeteredFeature,
} from "@/internal/features/utils/constructFeatureUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { isBooleanFeatureItem } from "./productItemUtils/getItemType.js";

export const createFeaturesFromItems = ({
	items,
	curFeatures,
	orgId,
	env,
}: {
	items: ProductItem[];
	curFeatures: Feature[];
	orgId: string;
	env: AppEnv;
}) => {
	const newFeatures: Feature[] = [];
	for (const item of items) {
		if (!item.feature_id) {
			continue;
		}

		const feature = curFeatures.find((f) => f.id === item.feature_id);

		if (feature) {
			if (nullish(item.feature_type)) {
				continue;
			}
			// 1. Check that feature_type matches
			if (item.feature_type === ProductItemFeatureType.Static) {
				const booleanFail =
					item.feature_type === ProductItemFeatureType.Static &&
					feature.type !== FeatureType.Boolean;

				if (booleanFail) {
					throw new RecaseError({
						message: `Feature ${item.feature_id} already exists but is not a static feature`,
						code: ErrCode.InvalidRequest,
						statusCode: 400,
					});
				}
			} else {
				const featureUsageType =
					item.feature_type as unknown as FeatureUsageType;

				const usageFail = featureUsageType !== feature.usage_type;
				if (usageFail) {
					throw new RecaseError({
						message: `Feature ${item.feature_id} already exists but is not a ${item.feature_type} feature`,
						code: ErrCode.InvalidRequest,
						statusCode: 400,
					});
				}
			}

			continue;
		}

		validateFeatureId(item.feature_id);

		if (isBooleanFeatureItem(item)) {
			const feature = constructBooleanFeature({
				featureId: item.feature_id!,
				orgId,
				env,
			});
			newFeatures.push(feature);
		} else {
			if (!item.feature_type) {
				throw new RecaseError({
					message: `Feature type is required for ${item.feature_id}. Either 'continuous_use' or 'single_use'`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			const feature = constructMeteredFeature({
				featureId: item.feature_id!,
				orgId,
				env,
				usageType:
					item.feature_type === ProductItemFeatureType.ContinuousUse
						? FeatureUsageType.ContinuousUse
						: FeatureUsageType.SingleUse,
			});
			newFeatures.push(feature);
		}
	}

	return { allFeatures: [...curFeatures, ...newFeatures], newFeatures };
};

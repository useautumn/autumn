import {
  AppEnv,
  ErrCode,
  Feature,
  FeatureType,
  FeatureUsageType,
  ProductItem,
  ProductItemFeatureType,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { isBooleanFeatureItem } from "./getItemType.js";
import { validateFeatureId } from "@/internal/features/featureUtils.js";
import {
  constructBooleanFeature,
  constructMeteredFeature,
} from "@/internal/features/utils/constructFeatureUtils.js";

import RecaseError from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";

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
  let newFeatures: Feature[] = [];
  for (const item of items) {
    if (!item.feature_id) {
      continue;
    }

    let feature = curFeatures.find((f) => f.id == item.feature_id);
    if (feature) {
      if (nullish(item.feature_type)) {
        continue;
      }
      // 1. Check that feature_type matches
      if (item.feature_type == ProductItemFeatureType.Static) {
        let booleanFail =
          item.feature_type == ProductItemFeatureType.Static &&
          feature.type != FeatureType.Boolean;

        if (booleanFail) {
          throw new RecaseError({
            message: `Feature ${item.feature_id} already exists but is not a static feature`,
            code: ErrCode.InvalidRequest,
            statusCode: 400,
          });
        }
      } else {
        let usageFail = item.feature_type != feature.config?.usage_type;
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
          item.feature_type == ProductItemFeatureType.ContinuousUse
            ? FeatureUsageType.Continuous
            : FeatureUsageType.Single,
      });
      newFeatures.push(feature);
    }
  }

  return { allFeatures: [...curFeatures, ...newFeatures], newFeatures };
};

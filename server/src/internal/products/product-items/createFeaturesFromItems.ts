import { AppEnv, Feature, ProductItem } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { isBooleanFeatureItem } from "./getItemType.js";
import {
  constructBooleanFeature,
  constructMeteredFeature,
} from "@/internal/features/featureUtils.js";

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
    if (!item.feature_id || curFeatures.find((f) => f.id === item.feature_id)) {
      continue;
    }



    if (isBooleanFeatureItem(item)) {
      const feature = constructBooleanFeature({
        featureId: item.feature_id!,
        orgId,
        env,
      });
      newFeatures.push(feature);
    } else {
      const feature = constructMeteredFeature({
        featureId: item.feature_id!,
        orgId,
        env,
      });
      newFeatures.push(feature);
    }
  }

  
  return { allFeatures: [...curFeatures, ...newFeatures], newFeatures };
};

import { Feature, FeatureType } from "@autumn/shared";
import { FeatureResponseSchema, FeatureResType } from "@autumn/shared";

export const featureToResponse = (feature: Feature) => {
  // return FeatureResponseSchema.parse(feature);
  // 1. Get feature type
  let featureType = feature.type;
  if (feature.type == FeatureType.Metered) {
    featureType = feature.config.usage_type;
  }

  return FeatureResponseSchema.parse({
    id: feature.id,
    name: feature.name,
    type: featureType,
  });
};

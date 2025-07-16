import {
  APIFeature,
  APIFeatureType,
  Feature,
  FeatureResType,
  FeatureType,
} from "@autumn/shared";
import { APIFeatureSchema } from "@autumn/shared";

export const toAPIFeature = ({ feature }: { feature: Feature }) => {
  // return FeatureResponseSchema.parse(feature);
  // 1. Get feature type
  let featureType = feature.type;
  if (feature.type == FeatureType.Metered) {
    featureType = feature.config.usage_type;
  }

  return APIFeatureSchema.parse({
    id: feature.id,
    name: feature.name,
    type: featureType,
    display: {
      singular: feature.display?.singular || feature.name,
      plural: feature.display?.plural || feature.name,
    },
  });
};

export const fromAPIFeature = ({ apiFeature }: { apiFeature: APIFeature }) => {
  let isMetered =
    apiFeature.type == APIFeatureType.SingleUsage ||
    apiFeature.type == APIFeatureType.ContinuousUse;

  let featureType: FeatureType = isMetered
    ? FeatureType.Metered
    : (apiFeature.type as unknown as FeatureType);

  // let config = isMetered ? getMetered

  let feature: Feature = {
    id: apiFeature.id,
    name: apiFeature.name,
    type: featureType,
    display: {
      singular: apiFeature.display?.singular || apiFeature.name,
      plural: apiFeature.display?.plural || apiFeature.name,
    },
  };
};

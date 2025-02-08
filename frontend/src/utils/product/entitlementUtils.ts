import {
  Entitlement,
  Feature,
  Price,
  PriceType,
  UsagePriceConfig,
} from "@autumn/shared";

export const getFeature = (
  internalFeatureId: string | undefined,
  features: Feature[]
) => {
  const foundFeature = features?.find(
    (feature: Feature) => feature.internal_id === internalFeatureId
  );
  return foundFeature || null;
};

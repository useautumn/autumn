import { Feature, FeatureType } from "@autumn/shared";

export const featureContainsEvent = ({
  feature,
  eventName,
}: {
  feature: Feature;
  eventName: string;
}) => {
  if (feature.type !== FeatureType.Metered) {
    return false;
  }
  return feature.config.filters.some((filter: any) => {
    return filter.value.includes(eventName);
  });
};

export const isRelevantFeature = ({
  feature,
  eventName,
}: {
  feature: Feature;
  eventName: string;
}) => {
  if (feature.type === FeatureType.Metered) {
    return featureContainsEvent({ feature, eventName });
  }
  return feature.type === FeatureType.CreditSystem;
};

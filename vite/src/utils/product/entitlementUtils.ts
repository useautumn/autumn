import { Feature } from "@autumn/shared";

export const getFeature = (
  featureId: string | undefined,
  features: Feature[]
) => {
  const foundFeature = features?.find(
    (feature: Feature) => feature.id === featureId
  );
  return foundFeature || null;
};

import { Feature, ProductItem } from "@autumn/shared";

export const getFeature = (
  featureId: string | undefined,
  features: Feature[],
) => {
  const foundFeature = features?.find(
    (feature: Feature) => feature.id === featureId,
  );
  return foundFeature || null;
};

export const getFeatureUsageType = ({
  item,
  features,
}: {
  item: ProductItem;
  features: Feature[];
}) => {
  if (!item.feature_id) return null;
  const feature = getFeature(item.feature_id, features);

  return feature?.config?.usage_type;
};

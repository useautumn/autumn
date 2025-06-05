import { Feature, ProductItem } from "@autumn/shared";

export const itemToFeature = ({
  item,
  features,
}: {
  item: ProductItem;
  features: Feature[];
}) => {
  const feature = features.find((f) => f.id === item.feature_id);

  if (!feature) {
    return null;
  }

  return feature;
};

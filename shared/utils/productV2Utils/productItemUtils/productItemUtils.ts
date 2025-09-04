import { FeatureType } from "../../../models/featureModels/featureEnums.js";
import { Feature } from "../../../models/featureModels/featureModels.js";
import { EntInterval } from "../../../models/productModels/entModels/entEnums.js";
import { BillingInterval } from "../../../models/productModels/priceModels/priceEnums.js";
import {
  ProductItem,
  ProductItemFeatureType,
  ProductItemInterval,
} from "../../../models/productV2Models/productItemModels/productItemModels.js";

export const entToItemInterval = (entInterval: EntInterval) => {
  if (entInterval == EntInterval.Lifetime) {
    return null;
  }
  return entInterval as unknown as ProductItemInterval;
};

export const billingToItemInterval = (billingInterval: BillingInterval) => {
  if (billingInterval == BillingInterval.OneOff) {
    return null;
  }

  return billingInterval as unknown as ProductItemInterval;
};

export const getItemFeatureType = ({
  item,
  features,
}: {
  item: ProductItem;
  features: Feature[];
}) => {
  let feature = features.find((f) => f.id == item.feature_id);

  if (feature) {
    if (feature.type == FeatureType.Boolean) {
      return ProductItemFeatureType.Static;
    } else if (feature.type == FeatureType.CreditSystem) {
      return ProductItemFeatureType.SingleUse;
    } else {
      return feature.config?.usage_type;
    }
  }

  return undefined;
};

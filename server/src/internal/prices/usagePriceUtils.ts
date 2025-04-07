import { Price } from "@shared/models/productModels/priceModels.js";
import { UsagePriceConfig } from "@shared/models/productModels/usagePriceModels.js";

export const pricesHaveSameFeature = ({
  price1,
  price2,
}: {
  price1: Price;
  price2: Price;
}) => {
  if (price1.config?.type !== price2.config?.type) {
    return false;
  }

  let config1 = price1.config as UsagePriceConfig;
  let config2 = price2.config as UsagePriceConfig;

  return config1.internal_feature_id === config2.internal_feature_id;
};

import {
  isFeaturePriceItem,
  itemToPriceOrTiers,
} from "@/internal/products/product-items/productItemUtils.js";
import { orgToVersion } from "@/utils/versionUtils.js";
import {
  APIVersion,
  CusEntWithEntitlement,
  Feature,
  FullProduct,
  Organization,
  ProductItem,
  SuccessCode,
  UsageModel,
} from "@autumn/shared";

export const getBooleanEntitledResult = ({
  customer_id,
  cusEnts,
  org,
  res,
  feature,
  apiVersion,
}: {
  customer_id: string;
  cusEnts: CusEntWithEntitlement[];
  org: Organization;
  res: any;
  feature: Feature;
  apiVersion: number;
}) => {
  const allowed = cusEnts.some(
    (cusEnt) => cusEnt.internal_feature_id === feature.internal_id
  );

  if (apiVersion >= APIVersion.v1_1) {
    return res.status(200).json({
      customer_id,
      feature_id: feature.id,
      code: SuccessCode.FeatureFound,
      allowed,
    });
  } else {
    return res.status(200).json({
      allowed,
      balances: allowed
        ? [
            {
              feature_id: feature.id,
              balance: null,
            },
          ]
        : [],
    });
  }
};

export const getOptions = ({
  prodItems,
  features,
}: {
  prodItems: ProductItem[];
  features: Feature[];
}) => {
  return prodItems
    .filter((i) => isFeaturePriceItem(i) && i.usage_model == UsageModel.Prepaid)
    .map((i) => {
      let priceData = itemToPriceOrTiers(i);
      return {
        feature_id: i.feature_id,
        feature_name: features.find((f) => f.id == i.feature_id)?.name,
        billing_units: i.billing_units,
        ...priceData,
      };
    });
};

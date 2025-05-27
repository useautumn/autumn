import {
  isFeaturePriceItem,
  itemToPriceOrTiers,
} from "@/internal/products/product-items/productItemUtils.js";
import { orgToVersion } from "@/utils/versionUtils.js";
import {
  APIVersion,
  Feature,
  FullCusProduct,
  FullCustomerEntitlement,
  Organization,
  ProductItem,
  SuccessCode,
  UsageModel,
} from "@autumn/shared";
import { getCheckPreview } from "./getCheckPreview.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const getBooleanEntitledResult = async ({
  db,
  customer_id,
  cusEnts,
  org,
  res,
  feature,
  apiVersion,
  withPreview,
  cusProducts,
  allFeatures,
}: {
  db: DrizzleCli;
  customer_id: string;
  cusEnts: FullCustomerEntitlement[];
  org: Organization;
  res: any;
  feature: Feature;
  apiVersion: number;
  withPreview: boolean;
  cusProducts: FullCusProduct[];
  allFeatures: Feature[];
}) => {
  const allowed = cusEnts.some(
    (cusEnt) => cusEnt.internal_feature_id === feature.internal_id,
  );

  if (apiVersion >= APIVersion.v1_1) {
    return res.status(200).json({
      customer_id,
      feature_id: feature.id,
      code: SuccessCode.FeatureFound,
      allowed,
      preview: withPreview
        ? await getCheckPreview({
            db,
            allowed,
            balance: undefined,
            feature,
            raw: false,
            cusProducts,
            allFeatures,
          })
        : undefined,
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

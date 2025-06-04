import { itemToPriceOrTiers } from "@/internal/products/product-items/productItemUtils.js";
import { isFeaturePriceItem } from "@/internal/products/product-items/getItemType.js";

import {
  APIVersion,
  BillingInterval,
  Feature,
  FreeTrial,
  FullCusProduct,
  FullCustomerEntitlement,
  Organization,
  ProductItem,
  SuccessCode,
  UsageModel,
} from "@autumn/shared";
import { getCheckPreview } from "./getCheckPreview.js";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { getProration } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { formatUnixToDateTime } from "@/utils/genUtils.js";

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
  anchorToUnix,
  proration,
  now,
  freeTrial,
}: {
  prodItems: ProductItem[];
  features: Feature[];
  anchorToUnix?: number;
  proration?: {
    start: number;
    end: number;
  };
  now?: number;
  freeTrial?: FreeTrial | null;
}) => {
  now = now || Date.now();

  return prodItems
    .filter((i) => isFeaturePriceItem(i) && i.usage_model == UsageModel.Prepaid)
    .map((i) => {
      const finalProration = getProration({
        anchorToUnix,
        proration,
        interval: (i.interval || BillingInterval.OneOff) as BillingInterval,
        now,
      });

      let priceData = itemToPriceOrTiers({
        item: i,
        proration: finalProration,
        now,
      });
      let actualPrice = itemToPriceOrTiers({
        item: i,
      });
      console.log("Price data:", priceData);
      console.log("Actual price:", actualPrice);

      if (freeTrial) {
        priceData = {
          price: 0,
          tiers: undefined,
        };
      }

      return {
        feature_id: i.feature_id,
        feature_name: features.find((f) => f.id == i.feature_id)?.name,
        billing_units: i.billing_units,
        included_usage: i.included_usage || 0,
        ...priceData,

        full_price: actualPrice?.price,
        full_tiers: actualPrice?.tiers,
      };
    });
};

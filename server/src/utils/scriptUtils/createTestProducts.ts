import { DrizzleCli } from "@/db/initDrizzle.js";
import {
  constructBooleanFeature,
  constructMeteredFeature,
} from "@/internal/features/utils/constructFeatureUtils.js";
import {
  AppEnv,
  BillingInterval,
  Feature,
  FeatureUsageType,
  Product,
  ProductItem,
  ProductV2,
} from "@autumn/shared";
import {
  constructArrearItem,
  constructArrearProratedItem,
} from "./constructItem.js";
import { constructPrepaidItem } from "./constructItem.js";
import { keyToTitle } from "../genUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";

export enum TestFeatureType {
  Boolean = "boolean",
  SingleUse = "single_use",
  ContinuousUse = "continuous_use",
}

export const initFeature = ({
  id,
  orgId,
  type,
}: {
  id: string;
  orgId: string;
  type: TestFeatureType;
}) => {
  if (type === TestFeatureType.Boolean) {
    return constructBooleanFeature({
      featureId: id,
      orgId,
      env: AppEnv.Sandbox,
    });
  } else if (type === TestFeatureType.SingleUse) {
    return constructMeteredFeature({
      featureId: id,
      orgId,
      env: AppEnv.Sandbox,
      usageType: FeatureUsageType.Single,
    });
  } else {
    return constructMeteredFeature({
      featureId: id,
      orgId,
      env: AppEnv.Sandbox,
      usageType: FeatureUsageType.Continuous,
    });
  }
};

// enum TestItemType {
//   Prepaid = "prepaid",
//   Arrear = "arrear",
//   ArrearProrated = "arrear_prorated",
//   FixedPrice = "fixed_price",
// }

export const constructProduct = ({
  items,
  type,
  isAnnual = false,
}: {
  items: ProductItem[];
  type: "free" | "pro" | "premium";
  isAnnual?: boolean;
}) => {
  let price = type == "pro" ? 20 : 50;

  if (price) {
    items.push(
      constructPriceItem({
        price: isAnnual ? price * 10 : price,
        interval: isAnnual ? BillingInterval.Year : BillingInterval.Month,
      }),
    );
  }

  let product: ProductV2 = {
    id: isAnnual ? `${type}-annual` : type,
    name: isAnnual ? `${keyToTitle(type)} (Annual)` : keyToTitle(type),
    items,
    is_add_on: false,
    is_default: false,
    version: 1,
    group: "",
    free_trial: null,
  };

  return product;
};

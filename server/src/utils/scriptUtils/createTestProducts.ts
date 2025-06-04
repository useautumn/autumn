import { DrizzleCli } from "@/db/initDrizzle.js";
import {
  constructBooleanFeature,
  constructMeteredFeature,
} from "@/internal/features/utils/constructFeatureUtils.js";
import {
  AppEnv,
  BillingInterval,
  CreateFreeTrialSchema,
  Feature,
  FeatureUsageType,
  FreeTrialDuration,
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
  id,
  items,
  type,
  interval,
  isAnnual = false,
  trial = false,
  excludeBase = false,
  isDefault = true,
}: {
  id?: string;
  items: ProductItem[];
  type: "free" | "pro" | "premium" | "growth" | "one_off";
  interval?: BillingInterval;
  isAnnual?: boolean;
  trial?: boolean;
  excludeBase?: boolean;
  isDefault?: boolean;
}) => {
  let price = 0;
  if (type == "pro") {
    price = 20;
  } else if (type == "premium") {
    price = 50;
  } else if (type == "growth") {
    price = 100;
  }

  if (price && !excludeBase) {
    items.push(
      constructPriceItem({
        price: isAnnual ? price * 10 : price,
        interval: isAnnual
          ? BillingInterval.Year
          : interval
            ? interval
            : BillingInterval.Month,
      }),
    );
  }

  if (type == "one_off") {
    items.push(
      constructPriceItem({
        price: 10,
        interval: null,
      }),
    );
  }

  let id_ =
    id ||
    (isAnnual ? `${type}-annual` : interval ? `${type}-${interval}` : type);

  let product: ProductV2 = {
    id: id_,
    name: isAnnual
      ? `${keyToTitle(type)} (Annual)`
      : interval
        ? `${keyToTitle(type)} (${interval})`
        : keyToTitle(type),
    items,
    is_add_on: false,
    is_default: type == "free" && isDefault,
    version: 1,
    group: "",
    free_trial: trial
      ? (CreateFreeTrialSchema.parse({
          length: 7,
          duration: FreeTrialDuration.Day,
          unique_fingerprint: false,
        }) as any)
      : null,
  };

  return product;
};

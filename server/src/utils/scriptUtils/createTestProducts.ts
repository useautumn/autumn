import {
  constructBooleanFeature,
  constructMeteredFeature,
} from "@/internal/features/utils/constructFeatureUtils.js";
import {
  AppEnv,
  BillingInterval,
  CreateFreeTrial,
  CreateFreeTrialSchema,
  FeatureUsageType,
  FreeTrial,
  FreeTrialDuration,
  ProductItem,
  ProductV2,
} from "@autumn/shared";
import { keyToTitle } from "../genUtils.js";
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

export const constructRawProduct = ({
  id,
  isAddOn = false,
  items,
}: {
  id: string;
  isAddOn?: boolean;
  items: ProductItem[];
}) => {
  return {
    id,
    name: keyToTitle(id),
    items,
    is_add_on: isAddOn,
    is_default: false,
    version: 1,
    group: "",
  };
};
export const constructProduct = ({
  id,
  items,
  type,
  interval,
  isAnnual = false,
  trial = false,
  excludeBase = false,
  isDefault = true,
  isAddOn = false,
  freeTrial,
}: {
  id?: string;
  items: ProductItem[];
  type: "free" | "pro" | "premium" | "growth" | "one_off";
  interval?: BillingInterval;
  isAnnual?: boolean;
  trial?: boolean;
  excludeBase?: boolean;
  isDefault?: boolean;
  isAddOn?: boolean;
  freeTrial?: CreateFreeTrial;
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
      })
    );
  }

  if (type == "one_off") {
    items.push(
      constructPriceItem({
        price: 10,
        interval: null,
      })
    );
  }

  let id_ =
    id ||
    (isAnnual ? `${type}-annual` : interval ? `${type}-${interval}` : type);

  let product: ProductV2 = {
    id: id_,
    name: id
      ? keyToTitle(id)
      : isAnnual
        ? `${keyToTitle(type)} (Annual)`
        : interval
          ? `${keyToTitle(type)} (${interval})`
          : keyToTitle(type),
    items,
    is_add_on: isAddOn,
    is_default: type == "free" && isDefault,
    version: 1,
    group: "",
    free_trial:
      freeTrial || trial
        ? (CreateFreeTrialSchema.parse({
            length: 7,
            duration: FreeTrialDuration.Day,
            unique_fingerprint: false,
          }) as any)
        : null,
    created_at: Date.now(),
  };

  return product;
};

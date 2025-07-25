import {
  AllowanceType,
  BillingInterval,
  BillingType,
  BillWhen,
  EntInterval,
  Entitlement,
  ErrCode,
  Feature,
  FeatureType,
  FixedPriceConfig,
  Infinite,
  Price,
  PriceType,
  ProductItem,
  UsageModel,
  TierInfinite,
  UsagePriceConfig,
  OnIncrease,
  OnDecrease,
  FeatureUsageType,
  features,
} from "@autumn/shared";
import { generateId, notNullish, nullish } from "@/utils/genUtils.js";
import { pricesAreSame } from "@/internal/products/prices/priceInitUtils.js";
import { entsAreSame } from "../../entitlements/entitlementUtils.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  isFeatureItem,
  isFeaturePriceItem,
  isPriceItem,
} from "./getItemType.js";
import {
  itemToBillingInterval,
  itemToEntInterval,
} from "../itemIntervalUtils.js";
import { itemCanBeProrated } from "./classifyItem.js";
import { shouldProrate } from "../../prices/priceUtils/prorationConfigUtils.js";

export const getResetUsage = ({
  item,
  feature,
}: {
  item: ProductItem;
  feature?: Feature;
}) => {
  if (!item.feature_id) {
    return undefined;
  }
  if (
    nullish(item.reset_usage_when_enabled) &&
    (isFeatureItem(item) || isFeaturePriceItem(item)) &&
    feature
  ) {
    return feature?.config?.usage_type == FeatureUsageType.Single;
  }
  return item.reset_usage_when_enabled;
};
// ITEM TO PRICE AND ENTITLEMENT
export const toPrice = ({
  item,
  orgId,
  internalProductId,
  isCustom,
  newVersion,
}: {
  item: ProductItem;
  orgId: string;
  internalProductId: string;
  isCustom: boolean;
  newVersion?: boolean;
}) => {
  let config: FixedPriceConfig = {
    type: PriceType.Fixed,
    amount: notNullish(item.price) ? item.price! : item.tiers![0].amount!,
    interval: itemToBillingInterval(item) as BillingInterval,
  };

  let price: Price = {
    id: item.price_id || generateId("pr"),
    created_at: item.created_at || Date.now(),
    org_id: orgId,
    internal_product_id: internalProductId,
    is_custom: isCustom,
    config,
    proration_config: null,
  };

  if (isCustom || newVersion) {
    price = {
      ...price,
      id: generateId("pr"),
      created_at: Date.now(),
    };
  }

  return { price, ent: null };
};

export const toFeature = ({
  item,
  orgId,
  internalFeatureId,
  internalProductId,
  isCustom,
  newVersion,
  feature,
}: {
  item: ProductItem;
  orgId: string;
  internalFeatureId: string;
  internalProductId: string;
  isCustom: boolean;
  newVersion?: boolean;
  feature?: Feature;
}) => {
  let isBoolean = feature?.type == FeatureType.Boolean;

  let resetUsage = getResetUsage({ item, feature });

  let ent: Entitlement = {
    id: item.entitlement_id || generateId("ent"),
    org_id: orgId,
    created_at: item.created_at || Date.now(),
    is_custom: isCustom,
    internal_product_id: internalProductId,

    internal_feature_id: internalFeatureId,
    feature_id: item.feature_id!,

    allowance: item.included_usage == Infinite ? null : item.included_usage!,
    allowance_type: isBoolean
      ? null
      : item.included_usage == Infinite
        ? AllowanceType.Unlimited
        : AllowanceType.Fixed,

    interval: isBoolean ? null : (itemToEntInterval(item) as EntInterval),

    carry_from_previous: !resetUsage,
    entity_feature_id: item.entity_feature_id,
    usage_limit: null,
  };

  if (isCustom || newVersion) {
    ent = {
      ...ent,
      id: generateId("ent"),
      created_at: Date.now(),
    };
  }
  return { price: null, ent };
};

export const toFeatureAndPrice = ({
  item,
  orgId,
  internalFeatureId,
  internalProductId,
  isCustom,
  curPrice,
  curEnt,
  newVersion,
  features,
}: {
  item: ProductItem;
  orgId: string;
  internalFeatureId: string;
  internalProductId: string;
  isCustom: boolean;
  curPrice?: Price;
  curEnt?: Entitlement;
  newVersion?: boolean;
  features: Feature[];
}) => {
  let resetUsage = getResetUsage({
    item,
    feature: features.find((f) => f.id == item.feature_id),
  });

  let ent: Entitlement = {
    id: item.entitlement_id || generateId("ent"),
    org_id: orgId,
    created_at: item.created_at || Date.now(),
    is_custom: isCustom,
    internal_product_id: internalProductId,

    internal_feature_id: internalFeatureId,
    feature_id: item.feature_id!,

    allowance: (item.included_usage as number) || 0,
    allowance_type: AllowanceType.Fixed,
    interval: itemToEntInterval(item) as EntInterval,

    carry_from_previous: !resetUsage,
    entity_feature_id: item.entity_feature_id,
    usage_limit: item.usage_limit || null,
  };

  // Will only create new ent id if
  let newEnt = !curEnt || (isCustom && !entsAreSame(curEnt, ent));
  if (newEnt || newVersion) {
    ent = {
      ...ent,
      id: generateId("ent"),
      created_at: Date.now(),
    };
  }

  let entInterval = itemToEntInterval(item);

  let config: UsagePriceConfig = {
    type: PriceType.Usage,

    bill_when:
      item.usage_model == UsageModel.Prepaid
        ? BillWhen.StartOfPeriod
        : BillWhen.EndOfPeriod,

    billing_units: item.billing_units || 1,
    should_prorate: entInterval == EntInterval.Lifetime,

    internal_feature_id: internalFeatureId,
    feature_id: item.feature_id!,
    usage_tiers: notNullish(item.price)
      ? [
          {
            amount: item.price,
            to: TierInfinite,
          },
        ]
      : (item.tiers as any),
    interval: itemToBillingInterval(item) as BillingInterval,
  };

  let prorationConfig = null;
  if (itemCanBeProrated({ item, features })) {
    let onIncrease = item.config?.on_increase || OnIncrease.ProrateImmediately;
    let onDecrease = item.config?.on_decrease || OnDecrease.Prorate;

    if (shouldProrate(onDecrease) || onDecrease == OnDecrease.Prorate) {
      onDecrease =
        onIncrease == OnIncrease.ProrateImmediately
          ? OnDecrease.ProrateImmediately
          : OnDecrease.ProrateNextCycle;
    }

    prorationConfig = {
      on_increase: onIncrease,
      on_decrease: onDecrease,
    };
  }

  let price: Price = {
    id: item.price_id || generateId("pr"),
    created_at: item.created_at || Date.now(),
    org_id: orgId,
    internal_product_id: internalProductId,
    is_custom: isCustom,
    config,
    entitlement_id: ent.id,
    proration_config: prorationConfig,
  };

  let billingType = getBillingType(price.config!);
  if (
    (billingType == BillingType.UsageInArrear ||
      billingType == BillingType.InArrearProrated) &&
    price.config!.interval == BillingInterval.OneOff
  ) {
    throw new RecaseError({
      message: `Usage prices cannot be one-off if not set to prepaid (feature: ${item.feature_id})`,
      code: ErrCode.InvalidPrice,
      statusCode: 400,
    });
  }

  let priceOrEntDifferent =
    (curPrice && !pricesAreSame(curPrice, price, true)) ||
    (curEnt && !entsAreSame(curEnt, ent));

  if (curPrice && (priceOrEntDifferent || newVersion)) {
    let newConfig = price.config as UsagePriceConfig;
    let curConfig = curPrice.config as UsagePriceConfig;
    newConfig.stripe_meter_id = curConfig.stripe_meter_id;
    newConfig.stripe_product_id = curConfig.stripe_product_id;
    price.config = newConfig;
  }

  if (isCustom || newVersion) {
    price = {
      ...price,
      id: generateId("pr"),
      created_at: Date.now(),
    };
  }

  return { price, ent };
};

export const itemToPriceAndEnt = ({
  item,
  orgId,
  internalProductId,
  feature,
  curPrice,
  curEnt,
  isCustom,
  newVersion,
  features,
}: {
  item: ProductItem;
  orgId: string;
  internalProductId: string;
  feature?: Feature;
  curPrice?: Price;
  curEnt?: Entitlement;
  isCustom: boolean;
  newVersion?: boolean;
  features: Feature[];
}) => {
  let newPrice: Price | null = null;
  let newEnt: Entitlement | null = null;

  let updatedPrice: Price | null = null;
  let updatedEnt: Entitlement | null = null;

  let samePrice: Price | null = null;
  let sameEnt: Entitlement | null = null;

  if (isPriceItem(item)) {
    let { price } = toPrice({
      item,
      orgId,
      internalProductId,
      isCustom,
      newVersion,
    });

    if (!curPrice || newVersion) {
      newPrice = price;
    } else if (!pricesAreSame(curPrice, price, true)) {
      updatedPrice = price;
    } else {
      samePrice = curPrice;
    }
  } else if (isFeatureItem(item)) {
    if (!feature) {
      throw new RecaseError({
        message: `Feature ${item.feature_id} not found`,
        code: ErrCode.InvalidRequest,
      });
    }
    let isBoolean = feature?.type == FeatureType.Boolean;

    let { ent } = toFeature({
      item,
      orgId,
      internalFeatureId: feature!.internal_id!,
      internalProductId,
      isCustom,
      newVersion,
      feature,
    });

    if (!curEnt || newVersion) {
      newEnt = ent;
    }

    // Boolean features can't be updated
    else if (!entsAreSame(curEnt, ent)) {
      updatedEnt = ent;
    } else {
      sameEnt = curEnt;
    }
  } else {
    if (!feature) {
      throw new RecaseError({
        message: `Feature ${item.feature_id} not found`,
        code: ErrCode.InvalidRequest,
      });
    }

    let { price, ent } = toFeatureAndPrice({
      item,
      orgId,
      internalFeatureId: feature!.internal_id!,
      internalProductId,
      isCustom,
      curPrice,
      curEnt,
      newVersion,
      features,
    });

    let entSame = curEnt && entsAreSame(curEnt, ent);

    // 1. If no curPrice, price is new
    if (!curPrice || newVersion) {
      newPrice = price;
    }

    // 2. If ent or price aren't same, price is updated
    else if (!entSame || !pricesAreSame(curPrice, price, false)) {
      updatedPrice = price;
    }

    // 3. price is same
    else {
      samePrice = curPrice;
    }

    // 1. If no curEnt, ent is new
    if (!curEnt || newVersion) {
      newEnt = ent;
    }

    // 2. If ent is different, ent is updated
    else if (!entSame) {
      updatedEnt = ent;
    }

    // 3. ent is same
    else {
      sameEnt = curEnt;
    }
  }

  return { newPrice, newEnt, updatedPrice, updatedEnt, samePrice, sameEnt };
};

import {
  AllowanceType,
  BillingInterval,
  BillingType,
  BillWhen,
  EntInterval,
  Entitlement,
  EntitlementWithFeature,
  Feature,
  FeatureType,
  FixedPriceConfig,
  FullEntitlement,
  Price,
  PriceType,
  ProductItem,
  ProductItemInterval,
  TierInfinite,
  UsagePriceConfig,
  UsageUnlimited,
} from "@autumn/shared";
import {
  intervalIsNone,
  itemIsFixedPrice,
  itemIsFree,
} from "./productItemUtils.js";
import { generateId, notNullish, nullish } from "@/utils/genUtils.js";
import { pricesAreSame } from "@/internal/prices/priceInitUtils.js";
import { entsAreSame } from "../entitlements/entitlementUtils.js";

const itemToBillingInterval = (interval: ProductItemInterval) => {
  if (interval == ProductItemInterval.None) {
    return BillingInterval.OneOff;
  }

  return interval;
};

const itemToEntInterval = (interval: ProductItemInterval) => {
  if (interval == ProductItemInterval.None) {
    return EntInterval.Lifetime;
  }

  return interval;
};

// ITEM TO PRICE AND ENTITLEMENT
export const toPrice = ({
  item,
  orgId,
  internalProductId,
  isCustom,
}: {
  item: ProductItem;
  orgId: string;
  internalProductId: string;
  isCustom: boolean;
}) => {
  let config: FixedPriceConfig = {
    type: PriceType.Fixed,
    amount: notNullish(item.amount) ? item.amount! : item.tiers![0].amount!,
    interval: itemToBillingInterval(item.interval!) as BillingInterval,
  };

  let price: Price = {
    id: item.price_id || generateId("pr"),
    created_at: item.created_at || Date.now(),
    org_id: orgId,
    internal_product_id: internalProductId,
    is_custom: isCustom,
    name: "",

    config,
  };

  return { price, ent: null };
};

export const toFeature = ({
  item,
  orgId,
  internalFeatureId,
  internalProductId,
  isCustom,
}: {
  item: ProductItem;
  orgId: string;
  internalFeatureId: string;
  internalProductId: string;
  isCustom: boolean;
}) => {
  let ent: Entitlement = {
    id: item.entitlement_id || generateId("ent"),
    org_id: orgId,
    created_at: item.created_at || Date.now(),
    is_custom: isCustom,
    internal_product_id: internalProductId,

    internal_feature_id: internalFeatureId,
    feature_id: item.feature_id!,

    allowance:
      item.included_usage == UsageUnlimited ? null : item.included_usage!,
    allowance_type:
      item.included_usage == UsageUnlimited
        ? AllowanceType.Unlimited
        : AllowanceType.Fixed,
    interval: itemToEntInterval(item.interval!) as EntInterval,

    carry_from_previous: item.carry_over_usage || false,
    entity_feature_id: item.entity_feature_id,
  };

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
}: {
  item: ProductItem;
  orgId: string;
  internalFeatureId: string;
  internalProductId: string;
  isCustom: boolean;
  curPrice?: Price;
  curEnt?: Entitlement;
}) => {
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
    interval: itemToEntInterval(item.interval!) as EntInterval,

    carry_from_previous: item.carry_over_usage || false,
    entity_feature_id: item.entity_feature_id,
  };

  let config: UsagePriceConfig = {
    type: PriceType.Usage,
    bill_when: BillWhen.EndOfPeriod,
    billing_units: item.billing_units || 1,
    should_prorate: item.reset_usage_on_interval || false,

    internal_feature_id: internalFeatureId,
    feature_id: item.feature_id!,

    usage_tiers: item.tiers as any,
    interval: itemToBillingInterval(item.interval!) as BillingInterval,
  };

  let price: Price = {
    id: item.price_id || generateId("pr"),
    created_at: item.created_at || Date.now(),
    org_id: orgId,
    internal_product_id: internalProductId,
    is_custom: isCustom,
    name: "",

    config,
    entitlement_id: item.entitlement_id,
  };

  let priceOrEntDifferent =
    (curPrice && !pricesAreSame(curPrice, price, true)) ||
    (curEnt && !entsAreSame(curEnt, ent));

  if (curPrice && priceOrEntDifferent) {
    let newConfig = price.config as UsagePriceConfig;
    let curConfig = curPrice.config as UsagePriceConfig;
    newConfig.stripe_meter_id = curConfig.stripe_meter_id;
    newConfig.stripe_product_id = curConfig.stripe_product_id;
    price.config = newConfig;
  }

  return { price, ent };
};

export const itemToPriceAndEnt = ({
  item,
  orgId,
  internalProductId,
  isCustom,
  feature,
  curPrice,
  curEnt,
}: {
  item: ProductItem;
  orgId: string;
  internalProductId: string;
  isCustom: boolean;
  feature?: Feature;
  curPrice?: Price;
  curEnt?: Entitlement;
}) => {
  let newPrice: Price | null = null;
  let newEnt: Entitlement | null = null;

  let updatedPrice: Price | null = null;
  let updatedEnt: Entitlement | null = null;

  if (itemIsFixedPrice(item)) {
    let { price } = toPrice({
      item,
      orgId,
      internalProductId,
      isCustom,
    });

    if (!curPrice) {
      newPrice = price;
    } else if (!pricesAreSame(curPrice, price)) {
      updatedPrice = price;
    }
  } else if (itemIsFree(item)) {
    let { ent } = toFeature({
      item,
      orgId,
      internalFeatureId: feature!.internal_id!,
      internalProductId,
      isCustom,
    });

    if (!curEnt) {
      newEnt = ent;
    } else if (!entsAreSame(curEnt, ent)) {
      updatedEnt = ent;
    }
  } else {
    let { price, ent } = toFeatureAndPrice({
      item,
      orgId,
      internalFeatureId: feature!.internal_id!,
      internalProductId,
      isCustom,
      curPrice,
      curEnt,
    });

    let entsSame = entsAreSame(curEnt!, ent);

    if (!curPrice) {
      newPrice = price;
    } else if (!pricesAreSame(curPrice, price, false) || !entsSame) {
      updatedPrice = price;
    }

    if (!entsSame) {
      updatedEnt = ent;
    }
  }

  return { newPrice, newEnt, updatedPrice, updatedEnt };
};

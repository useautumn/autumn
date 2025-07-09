import RecaseError from "@/utils/errorUtils.js";
import { generateId, notNullOrUndefined } from "@/utils/genUtils.js";
import {
  EntInterval,
  FreeTrial,
  Entitlement,
  AllowanceType,
  EntitlementWithFeature,
  FeatureType,
  CreateEntitlement,
  CreateEntitlementSchema,
  Feature,
  ErrCode,
  UsagePriceConfig,
  PriceType,
  Price,
  FullProduct,
  BillingType,
  FullEntitlement,
} from "@autumn/shared";

import { addDays } from "date-fns";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { features } from "process";

export const entIntervalToTrialDuration = (interval: EntInterval) => {
  switch (interval) {
    case EntInterval.Day:
      return 1;
    case EntInterval.Week:
      return 7;
    case EntInterval.Month:
      return 30;
    case EntInterval.Quarter:
      return 90;
    case EntInterval.SemiAnnual:
      return 180;
    case EntInterval.Year:
      return 365;
    case EntInterval.Lifetime:
      return 1000;
  }
};

export const applyTrialToEntitlement = (
  entitlement: EntitlementWithFeature,
  freeTrial: FreeTrial | null,
) => {
  if (!freeTrial) return false;

  if (entitlement.feature.type === FeatureType.Boolean) return false;
  if (!entitlement.interval || entitlement.interval === EntInterval.Lifetime)
    return false;
  if (entitlement.allowance_type === AllowanceType.Unlimited) return false;

  const trialDays = freeTrial.length;
  const entDays = entIntervalToTrialDuration(entitlement.interval!);

  if (entDays && entDays > trialDays) {
    return true;
  }

  return false;
};

export const addTrialToNextResetAt = (
  nextResetAt: number,
  freeTrial: FreeTrial | null,
) => {
  if (!freeTrial) return nextResetAt;

  return addDays(new Date(nextResetAt), freeTrial.length).getTime();
};

export const entsAreSame = (ent1: Entitlement, ent2: Entitlement) => {
  // 1. Check if they have same internal_feature_id
  if (ent1.internal_feature_id !== ent2.internal_feature_id) {
    console.log(
      `Internal feature ID different: ${ent1.internal_feature_id} !== ${ent2.internal_feature_id}`,
    );
    return false;
  }

  // 2. Check if they have same allowance type
  if (ent1.allowance_type !== ent2.allowance_type) {
    console.log(
      `Allowance type different: ${ent1.allowance_type} !== ${ent2.allowance_type}`,
    );
    return false;
  }
  // 3. Check if they have same interval
  let diffs = {
    interval: {
      condition: ent1.interval !== ent2.interval,
      message: `Interval different: ${ent1.interval} !== ${ent2.interval}`,
    },
    allowance: {
      condition:
        ent1.allowance_type !== AllowanceType.Unlimited &&
        ent1.allowance !== ent2.allowance,
      message: `Allowance different: ${ent1.allowance} !== ${ent2.allowance}`,
    },
    carryFromPrevious: {
      condition: ent1.carry_from_previous !== ent2.carry_from_previous,
      message: `Carry from previous different: ${ent1.carry_from_previous} !== ${ent2.carry_from_previous}`,
    },
    entityFeatureId: {
      condition: ent1.entity_feature_id !== ent2.entity_feature_id,
      message: `Entity feature ID different: ${ent1.entity_feature_id} !== ${ent2.entity_feature_id}`,
    },
    usageLimit: {
      condition: ent1.usage_limit !== ent2.usage_limit,
      message: `Usage limit different: ${ent1.usage_limit} !== ${ent2.usage_limit}`,
    },
  };

  let entsAreDiff = Object.values(diffs).some((d) => d.condition);

  // if (entsAreDiff) {
  //   console.log("Entitlements different");
  //   console.log(
  //     "Differences:",
  //     Object.values(diffs)
  //       .filter((d) => d.condition)
  //       .map((d) => d.message),
  //   );
  // }
  return !entsAreDiff;
};

// OTHERS
export const getEntRelatedPrice = (
  entitlement: Entitlement,
  prices: Price[],
  allowFeatureMatch = false,
) => {
  return prices.find((price) => {
    if (price.config?.type === PriceType.Fixed) {
      return false;
    }

    let config = price.config as UsagePriceConfig;

    if (allowFeatureMatch) {
      return entitlement.internal_feature_id == config.internal_feature_id;
    }

    let entIdMatch = entitlement.id == price.entitlement_id;
    let productIdMatch =
      entitlement.internal_product_id == price.internal_product_id;
    return entIdMatch && productIdMatch;
  });
};

export const getEntitlementsForProduct = (
  product: FullProduct,
  entitlements: EntitlementWithFeature[],
) => {
  return entitlements.filter(
    (ent) => ent.internal_product_id === product.internal_id,
  );
};

export const getEntsWithFeature = ({
  ents,
  features,
}: {
  ents: Entitlement[];
  features: Feature[];
}) => {
  return ents.map((ent) => {
    let feature = features.find(
      (f) => f.internal_id === ent.internal_feature_id,
    );
    if (!feature) {
      throw new RecaseError({
        message: `Couldn't find feature ${ent.internal_feature_id} for entitlement ${ent.id}`,
        code: ErrCode.FeatureNotFound,
      });
    }

    return {
      ...ent,
      feature,
    };
  }) as FullEntitlement[];
};

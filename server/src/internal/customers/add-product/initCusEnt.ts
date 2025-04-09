import {
  AllowanceType,
  BillingType,
  Customer,
  EntInterval,
  Entity,
  EntityBalance,
  FeatureType,
  FreeTrial,
  FullCusProduct,
  FullCustomerEntitlement,
  Price,
} from "@autumn/shared";

import { FeatureOptions } from "@autumn/shared";

import { EntitlementWithFeature } from "@autumn/shared";
import {
  getRelatedCusPrice,
  getResetBalance,
} from "../entitlements/cusEntUtils.js";
import { generateId, notNullish, nullish } from "@/utils/genUtils.js";
import { getBillingType, getEntOptions } from "@/internal/prices/priceUtils.js";
import { applyTrialToEntitlement } from "@/internal/products/entitlements/entitlementUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { getNextEntitlementReset } from "@/utils/timeUtils.js";
import {
  getAlignedIntervalUnix,
  subtractFromUnixTillAligned,
} from "@/internal/prices/billingIntervalUtils.js";
import { format } from "date-fns";
import { UTCDate } from "@date-fns/utc";
import {
  entitlementLinkedToEntity,
  isLinkedToEntity,
} from "@/internal/api/entities/entityUtils.js";

export const initCusEntEntities = ({
  entitlement,
  entities,
  existingCusEnt,
  resetBalance,
}: {
  entitlement: EntitlementWithFeature;
  entities: Entity[];
  existingCusEnt?: FullCustomerEntitlement;
  resetBalance?: number | null;
}) => {
  let newEntities: Record<string, EntityBalance> | null = notNullish(
    entitlement.entity_feature_id
  )
    ? {}
    : null;

  for (const entity of entities) {
    if (!entitlementLinkedToEntity({ entitlement, entity })) {
      continue;
    }

    if (
      existingCusEnt &&
      existingCusEnt.entities &&
      existingCusEnt.entities[entity.id]
    ) {
      continue;
    }

    if (!newEntities) {
      newEntities = {};
    }

    newEntities[entity.id] = {
      id: entity.id,
      balance: resetBalance || 0,
      adjustment: 0,
    };
  }

  return newEntities;
};

const initCusEntNextResetAt = ({
  entitlement,
  nextResetAt,
  keepResetIntervals,
  existingCusEnt,
  freeTrial,
  anchorToUnix,
}: {
  entitlement: EntitlementWithFeature;
  nextResetAt?: number;
  keepResetIntervals?: boolean;
  existingCusEnt?: FullCustomerEntitlement;
  freeTrial: FreeTrial | null;
  anchorToUnix?: number;
}) => {
  // 1. If entitlement is boolean, or unlimited, or lifetime, then next reset at is null
  if (
    entitlement.feature.type === FeatureType.Boolean ||
    entitlement.allowance_type === AllowanceType.Unlimited ||
    entitlement.interval == EntInterval.Lifetime
  ) {
    return null;
  }

  // 2. If nextResetAt (hardcoded), just return that...
  if (nextResetAt) {
    return nextResetAt;
  }

  // 3. If keepResetIntervals is true, return existing next reset at...
  if (keepResetIntervals && existingCusEnt?.next_reset_at) {
    return existingCusEnt.next_reset_at;
  }

  // 4. Calculate next reset at...
  let nextResetAtCalculated = null;
  let trialEndTimestamp = freeTrialToStripeTimestamp(freeTrial);
  if (
    freeTrial &&
    applyTrialToEntitlement(entitlement, freeTrial) &&
    trialEndTimestamp
  ) {
    nextResetAtCalculated = new UTCDate(trialEndTimestamp! * 1000);
  }

  let resetInterval = entitlement.interval as EntInterval;

  nextResetAtCalculated = getNextEntitlementReset(
    nextResetAtCalculated,
    resetInterval
  ).getTime();

  // console.log(
  //   "ANCHOR TO UNIX",
  //   anchorToUnix
  //     ? format(new Date(anchorToUnix), "dd MMM yyyy HH:mm:ss")
  //     : "undefined"
  // );

  // If anchorToUnix, align next reset at to anchorToUnix...
  if (anchorToUnix && nextResetAtCalculated) {
    nextResetAtCalculated = subtractFromUnixTillAligned({
      targetUnix: anchorToUnix,
      originalUnix: nextResetAtCalculated,
    });
  }

  // console.log(
  //   "NEXT RESET AT",
  //   format(new Date(nextResetAtCalculated), "dd MMM yyyy HH:mm:ss")
  // );

  return nextResetAtCalculated;
};

const initCusEntBalance = ({
  entitlement,
  curCusProduct,

  options,
  relatedPrice,
  existingCusEnt,
  entities,
  carryExistingUsages = false,
}: {
  entitlement: EntitlementWithFeature;
  curCusProduct?: FullCusProduct;

  options?: FeatureOptions;
  relatedPrice?: Price;
  existingCusEnt?: FullCustomerEntitlement;
  entities: Entity[];
  carryExistingUsages?: boolean;
}) => {
  if (entitlement.feature.type === FeatureType.Boolean) {
    return { newBalance: null, newEntities: null };
  }

  const resetBalance = getResetBalance({
    entitlement,
    options,
    relatedPrice,
  });

  let newEntities: Record<string, EntityBalance> | null = initCusEntEntities({
    entitlement,
    entities,
    existingCusEnt,
    resetBalance,
  });

  if (
    !existingCusEnt ||
    (!entitlement.carry_from_previous && !carryExistingUsages)
  ) {
    return { newBalance: resetBalance, newEntities };
  }

  let existingAllowanceType = existingCusEnt.entitlement.allowance_type;
  if (
    nullish(existingCusEnt.balance) ||
    existingAllowanceType === AllowanceType.Unlimited
  ) {
    return { newBalance: resetBalance, newEntities };
  }

  // Calculate existing usage

  let curOptions = getEntOptions(
    curCusProduct?.options || [],
    existingCusEnt.entitlement
  );
  let curPrice = getRelatedCusPrice(
    existingCusEnt,
    curCusProduct?.customer_prices || []
  );

  // console.log("Initializing balance for entitlement", entitlement.feature.id);
  // console.log("Existing balance", existingCusEnt?.balance);
  // console.log("Current options", curOptions);
  // console.log("Current price", curPrice?.price.name);

  let existingAllowance = getResetBalance({
    entitlement: existingCusEnt.entitlement,
    options: curOptions,
    relatedPrice: curPrice?.price,
  });

  let existingUsage = existingAllowance! - existingCusEnt.balance!;
  let newBalance = resetBalance! - existingUsage;

  if (
    entitlement.entity_feature_id ==
    existingCusEnt.entitlement.entity_feature_id
  ) {
    if (!newEntities) {
      newEntities = {};
    }

    for (const entityId in existingCusEnt.entities) {
      let existingBalance = existingCusEnt.entities[entityId].balance;
      let existingUsage = existingAllowance! - existingBalance;

      let newBalance = resetBalance! - existingUsage;

      newEntities[entityId] = {
        id: entityId,
        balance: newBalance,
        adjustment: 0,
      };
    }
  }

  return { newBalance, newEntities };
};

// MAIN FUNCTION
export const initCusEntitlement = ({
  entitlement,
  customer,
  cusProductId,
  freeTrial,
  options,
  nextResetAt,
  relatedPrice,
  existingCusEnt,
  keepResetIntervals = false,
  anchorToUnix,
  entities,
  carryExistingUsages = false,
  curCusProduct,
}: {
  entitlement: EntitlementWithFeature;
  customer: Customer;
  cusProductId: string;
  freeTrial: FreeTrial | null;
  options?: FeatureOptions;
  nextResetAt?: number;
  relatedPrice?: Price;
  existingCusEnt?: FullCustomerEntitlement;
  keepResetIntervals?: boolean;
  anchorToUnix?: number;
  entities: Entity[];
  carryExistingUsages?: boolean;
  curCusProduct?: FullCusProduct;
}) => {
  let { newBalance, newEntities } = initCusEntBalance({
    entitlement,
    options,
    relatedPrice,
    existingCusEnt,
    entities,
    carryExistingUsages,
    curCusProduct,
  });

  let nextResetAtValue = initCusEntNextResetAt({
    entitlement,
    nextResetAt,
    keepResetIntervals,
    existingCusEnt,
    freeTrial,
    anchorToUnix,
  });

  // 3. Define expires at (TODO next time...)
  let isBooleanFeature = entitlement.feature.type === FeatureType.Boolean;
  let usageAllowed = false;

  if (
    relatedPrice &&
    (getBillingType(relatedPrice.config!) === BillingType.UsageInArrear ||
      getBillingType(relatedPrice.config!) === BillingType.InArrearProrated)
  ) {
    usageAllowed = true;
  }

  // Calculate balance...

  return {
    id: generateId("cus_ent"),
    internal_customer_id: customer.internal_id,
    internal_feature_id: entitlement.internal_feature_id,
    feature_id: entitlement.feature_id,
    customer_id: customer.id,

    // Foreign keys
    entitlement_id: entitlement.id,
    customer_product_id: cusProductId,
    created_at: Date.now(),

    // Entitlement fields
    unlimited: isBooleanFeature
      ? null
      : entitlement.allowance_type === AllowanceType.Unlimited,
    balance: newBalance,
    entities: newEntities,
    usage_allowed: usageAllowed,
    next_reset_at: nextResetAtValue,
  };
};

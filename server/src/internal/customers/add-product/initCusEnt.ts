import {
  AllowanceType,
  BillingType,
  Customer,
  EntInterval,
  FeatureType,
  FreeTrial,
  FullCustomerEntitlement,
  Price,
} from "@autumn/shared";

import { FeatureOptions } from "@autumn/shared";

import { EntitlementWithFeature } from "@autumn/shared";
import { getResetBalance } from "../entitlements/cusEntUtils.js";
import {
  generateId,
  notNullish,
  notNullOrUndefined,
  nullish,
} from "@/utils/genUtils.js";
import { getBillingType } from "@/internal/prices/priceUtils.js";
import { applyTrialToEntitlement } from "@/internal/products/entitlements/entitlementUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { getNextEntitlementReset } from "@/utils/timeUtils.js";
import {
  getAlignedIntervalUnix,
  subtractFromUnixTillAligned,
} from "@/internal/prices/billingIntervalUtils.js";
import { format } from "date-fns";
import { UTCDate } from "@date-fns/utc";
import { getOriginalFeature } from "../entitlements/linkedGroupUtils.js";
import { groupByExists } from "../entitlements/groupByUtils.js";
const initCusEntBalance = ({
  entitlement,
  options,
  relatedPrice,
  existingCusEnt,
}: {
  entitlement: EntitlementWithFeature;
  options?: FeatureOptions;
  relatedPrice?: Price;
  existingCusEnt?: FullCustomerEntitlement;
}) => {
  if (entitlement.feature.type === FeatureType.Boolean) {
    return {
      newBalance: null,
      newBalances: null,
    };
  }

  const resetBalance = getResetBalance({
    entitlement,
    options,
    relatedPrice,
  });

  const feature = entitlement.feature;

  if (!existingCusEnt || !entitlement.carry_from_previous) {
    return {
      newBalance: groupByExists(feature) ? 0 : resetBalance,
      newBalances: groupByExists(feature) ? {} : null,
    };
  }

  let existingAllowanceType = existingCusEnt.entitlement.allowance_type;
  if (
    nullish(existingCusEnt.balance) ||
    existingAllowanceType === AllowanceType.Unlimited
  ) {
    return {
      newBalance: groupByExists(feature) ? 0 : resetBalance,
      newBalances: groupByExists(feature) ? {} : null,
    };
  }

  // Calculate existing usage

  let existingAllowance = existingCusEnt.entitlement.allowance!;
  let existingUsage = existingAllowance - existingCusEnt.balance!;
  let newBalance = resetBalance! - existingUsage;

  let newBalances: any = null;
  if (groupByExists(feature)) {
    newBalance = 0;

    let balances = existingCusEnt.balances || {};
    newBalances = {};
    for (const key in balances) {
      if (balances[key] && !balances[key].deleted) {
        let existingUsage = existingAllowance - balances[key].balance;
        newBalances[key] = {
          balance: resetBalance! - existingUsage,
          adjustment: 0,
          deleted: false,
        };
      }
    }
  }

  return { newBalance, newBalances };
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
}) => {
  let { newBalance, newBalances } = initCusEntBalance({
    entitlement,
    options,
    relatedPrice,
    existingCusEnt,
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

  let feature = entitlement.feature;
  let groupByExists = notNullish(feature.config.group_by);

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
    // balance: isBooleanFeature ? null : groupByExists ? 0 : balance,
    balance: newBalance,
    balances: newBalances,
    usage_allowed: usageAllowed,
    next_reset_at: nextResetAtValue,
  };
};

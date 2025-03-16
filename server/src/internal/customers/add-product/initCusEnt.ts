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
import { generateId, nullish } from "@/utils/genUtils.js";
import { getBillingType } from "@/internal/prices/priceUtils.js";
import { applyTrialToEntitlement } from "@/internal/products/entitlements/entitlementUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { getNextEntitlementReset } from "@/utils/timeUtils.js";
import {
  getAlignedIntervalUnix,
  subtractFromUnixTillAligned,
} from "@/internal/prices/billingIntervalUtils.js";
import { format } from "date-fns";

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
    return null;
  }

  const resetBalance = getResetBalance({
    entitlement,
    options,
    relatedPrice,
  });

  if (!existingCusEnt || !entitlement.carry_from_previous) {
    return resetBalance;
  }

  let existingAllowanceType = existingCusEnt.entitlement.allowance_type;
  if (
    nullish(existingCusEnt.balance) ||
    existingAllowanceType === AllowanceType.Unlimited
  ) {
    return resetBalance;
  }

  // Calculate existing usage
  let existingAllowance = existingCusEnt.entitlement.allowance!;
  let existingUsage = existingAllowance - existingCusEnt.balance!;

  let newBalance = resetBalance! - existingUsage;

  return newBalance;
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
    nextResetAtCalculated = new Date(trialEndTimestamp! * 1000);
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
  // const resetBalance = getResetBalance({
  //   entitlement,
  //   options,
  //   relatedPrice,
  // });

  let balance = initCusEntBalance({
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
    balance: isBooleanFeature ? null : balance,
    usage_allowed: usageAllowed,
    next_reset_at: nextResetAtValue,
  };
};

import { applyTrialToEntitlement } from "@/internal/products/entitlements/entitlementUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { subtractFromUnixTillAligned } from "@/internal/products/prices/billingIntervalUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import { getNextEntitlementReset } from "@/utils/timeUtils.js";
import {
  EntInterval,
  AllowanceType,
  EntitlementWithFeature,
  FeatureType,
  FreeTrial,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";

export const initNextResetAt = ({
  entitlement,
  nextResetAt,
  trialEndsAt,
  freeTrial,
  anchorToUnix,
  now,
}: {
  entitlement: EntitlementWithFeature;
  nextResetAt?: number;
  trialEndsAt?: number;
  freeTrial: FreeTrial | null;
  anchorToUnix?: number;
  now: number;
}) => {
  // 1. If entitlement is boolean, or unlimited, or lifetime, then next reset at is null
  if (
    entitlement.feature.type === FeatureType.Boolean ||
    entitlement.allowance_type === AllowanceType.Unlimited ||
    entitlement.interval == EntInterval.Lifetime
  ) {
    return null;
  }

  // 2. If nextResetAt is provided, return it...
  if (nextResetAt) {
    return nextResetAt;
  }

  // 3. Calculate next reset at...
  let nextResetAtCalculated = null;
  let trialEndTimestamp = trialEndsAt
    ? Math.round(trialEndsAt / 1000)
    : freeTrial
      ? freeTrialToStripeTimestamp({ freeTrial, now })
      : null;

  if (
    freeTrial &&
    applyTrialToEntitlement(entitlement, freeTrial) &&
    trialEndTimestamp
  ) {
    nextResetAtCalculated = new UTCDate(trialEndTimestamp! * 1000);
  }

  let resetInterval = entitlement.interval as EntInterval;

  nextResetAtCalculated = getNextEntitlementReset(
    nextResetAtCalculated || new UTCDate(now),
    resetInterval,
    entitlement.interval_count || 1
  ).getTime();

  // If anchorToUnix, align next reset at to anchorToUnix...
  if (anchorToUnix && nextResetAtCalculated) {
    nextResetAtCalculated = subtractFromUnixTillAligned({
      targetUnix: anchorToUnix,
      originalUnix: nextResetAtCalculated,
    });
  }

  return nextResetAtCalculated;
};

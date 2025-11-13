import {
	AllowanceType,
	BillingInterval,
	EntInterval,
	type EntitlementWithFeature,
	FeatureType,
	type FreeTrial,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { applyTrialToEntitlement } from "@/internal/products/entitlements/entitlementUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { getNextEntitlementReset } from "@/utils/timeUtils.js";
import { getAlignedUnix } from "../../../../products/prices/billingIntervalUtils2.js";

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
		entitlement.interval === EntInterval.Lifetime
	) {
		return null;
	}

	// 2. If nextResetAt is provided, return it...
	if (nextResetAt) return nextResetAt;

	// 3. Calculate next reset at...
	let nextResetAtCalculated = null;
	const trialEndTimestamp = trialEndsAt
		? Math.round(trialEndsAt / 1000)
		: freeTrial
			? freeTrialToStripeTimestamp({ freeTrial, now })
			: null;

	const resetInterval = entitlement.interval as EntInterval;
	const nowDate = new UTCDate(now);
	const entitlementResetFromNow = getNextEntitlementReset(
		nowDate,
		resetInterval,
		entitlement.interval_count || 1,
	);

	if (
		freeTrial &&
		applyTrialToEntitlement(entitlement, freeTrial) &&
		trialEndTimestamp
	) {
		const trialEndDate = new UTCDate(trialEndTimestamp * 1000);

		// Compare trial duration with entitlement cycle
		// If trial ends BEFORE the first entitlement reset, use trial end as base
		// Otherwise, use current time as base (trial is longer than reset cycle)
		if (trialEndDate.getTime() < entitlementResetFromNow.getTime()) {
			// Trial < Entitlement cycle: next reset = trial end + entitlement cycle
			nextResetAtCalculated = new UTCDate(trialEndTimestamp * 1000);
		} else {
			// Trial > Entitlement cycle: next reset = now + entitlement cycle
			nextResetAtCalculated = nowDate;
		}
	}

	nextResetAtCalculated = getNextEntitlementReset(
		nextResetAtCalculated || nowDate,
		resetInterval,
		entitlement.interval_count || 1,
	).getTime();

	// If anchorToUnix, align next reset at to anchorToUnix...
	if (
		anchorToUnix &&
		nextResetAtCalculated &&
		Object.values(BillingInterval).includes(
			entitlement.interval as unknown as BillingInterval,
		)
	) {
		nextResetAtCalculated = getAlignedUnix({
			anchor: anchorToUnix,
			intervalConfig: {
				interval: entitlement.interval as unknown as BillingInterval,
				intervalCount: entitlement.interval_count || 1,
			},
			now,
		});
	}

	return nextResetAtCalculated;
};

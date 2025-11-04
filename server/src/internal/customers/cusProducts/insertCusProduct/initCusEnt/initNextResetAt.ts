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
import { formatUnixToDateTime } from "../../../../../utils/genUtils.js";
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

	if (
		freeTrial &&
		applyTrialToEntitlement(entitlement, freeTrial) &&
		trialEndTimestamp
	) {
		nextResetAtCalculated = new UTCDate(trialEndTimestamp! * 1000);
	}

	const resetInterval = entitlement.interval as EntInterval;

	nextResetAtCalculated = getNextEntitlementReset(
		nextResetAtCalculated || new UTCDate(now),
		resetInterval,
		entitlement.interval_count || 1,
	).getTime();

	console.log(`--------------------------------`);
	console.log(`Interval: `, entitlement.interval);
	console.log(`Interval count: `, entitlement.interval_count);
	console.log(`Now: `, formatUnixToDateTime(now));
	console.log(`Next reset at: `, formatUnixToDateTime(nextResetAtCalculated));
	console.log(`Anchor to unix: `, formatUnixToDateTime(anchorToUnix));

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

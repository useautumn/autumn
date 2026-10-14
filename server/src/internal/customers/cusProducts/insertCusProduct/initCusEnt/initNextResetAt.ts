import {
	BillingInterval,
	EntInterval,
	type EntitlementWithFeature,
	FeatureType,
	type FreeTrial,
	getCycleEnd,
	getNextEntitlementReset,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { applyTrialToEntitlement } from "@/internal/products/entitlements/entitlementUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";

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
	freeTrial?: FreeTrial | null;
	anchorToUnix?: number;
	now: number;
}) => {
	if (
		entitlement.feature.type === FeatureType.Boolean ||
		!entitlement.interval ||
		entitlement.interval === EntInterval.Lifetime
	) {
		return null;
	}

	if (nextResetAt) return nextResetAt;

	let nextResetAtCalculated = null;
	const trialEndTimestamp = trialEndsAt
		? Math.round(trialEndsAt / 1000)
		: freeTrial
			? freeTrialToStripeTimestamp({ freeTrial, now })
			: null;

	const shouldApplyTrial = applyTrialToEntitlement(
		entitlement,
		freeTrial ?? null,
	);

	if (freeTrial && shouldApplyTrial && trialEndTimestamp) {
		nextResetAtCalculated = new UTCDate(trialEndTimestamp! * 1000);
	}

	const resetInterval = entitlement.interval as EntInterval;

	const startDate = nextResetAtCalculated || new UTCDate(now);
	nextResetAtCalculated = getNextEntitlementReset(
		startDate,
		resetInterval,
		entitlement.interval_count || 1,
	).getTime();

	if (
		anchorToUnix &&
		nextResetAtCalculated &&
		Object.values(BillingInterval).includes(
			entitlement.interval as unknown as BillingInterval,
		) &&
		!shouldApplyTrial
	) {
		nextResetAtCalculated = getCycleEnd({
			anchor: anchorToUnix,
			interval: entitlement.interval as unknown as BillingInterval,
			intervalCount: entitlement.interval_count || 1,
			now,
		});
	}

	return nextResetAtCalculated;
};

import {
	EntInterval,
	type EntitlementWithFeature,
	getCycleEnd,
	type InitCustomerEntitlementContext,
	type InitFullCustomerProductOptions,
	isResettingEntitlement,
} from "@autumn/shared";
import { clampNextResetAtToPendingBillingCycleAnchor } from "@/internal/billing/v2/utils/billingContext/getRequestedBillingCycleAnchorResetAt";

export const initCustomerEntitlementNextResetAt = ({
	initContext,
	initOptions,
	entitlement,
}: {
	initContext: InitCustomerEntitlementContext;
	initOptions?: InitFullCustomerProductOptions;
	entitlement: EntitlementWithFeature;
}) => {
	if (!isResettingEntitlement({ entitlement })) return null;

	let { resetCycleAnchor, now, trialEndsAt, transitionConfig } = initContext;
	const { resetAfterTrialEndFeatureIds } = transitionConfig ?? {};
	const { billingCycleAnchorResetsAt, startsAt } = initOptions ?? {};

	if (
		resetAfterTrialEndFeatureIds?.includes(entitlement.feature.id) &&
		trialEndsAt
	) {
		now = trialEndsAt;
	}

	const effectiveNow = startsAt ? Math.max(startsAt, now) : now;

	const nextResetAt = getCycleEnd({
		anchor: resetCycleAnchor,
		interval: entitlement.interval ?? EntInterval.Month,
		intervalCount: entitlement.interval_count,
		now: effectiveNow,
	});

	return clampNextResetAtToPendingBillingCycleAnchor({
		billingCycleAnchorResetsAt,
		currentEpochMs: effectiveNow,
		nextResetAt,
	});
};

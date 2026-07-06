import {
	EntInterval,
	type EntitlementWithFeature,
	formatMs,
	getCycleEnd,
	type InitCustomerEntitlementContext,
	type InitFullCustomerProductOptions,
	isResettingEntitlement,
} from "@autumn/shared";

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
	const { startsAt } = initOptions ?? {};

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

	return nextResetAt;
};

import {
	EntInterval,
	type EntitlementWithFeature,
	getCycleEnd,
	type InitFullCustomerProductContext,
	type InitFullCustomerProductOptions,
	isBooleanEntitlement,
	isLifetimeEntitlement,
	isUnlimitedEntitlement,
} from "@autumn/shared";

export const initCustomerEntitlementNextResetAt = ({
	initContext,
	initOptions,
	entitlement,
}: {
	initContext: InitFullCustomerProductContext;
	initOptions?: InitFullCustomerProductOptions;
	entitlement: EntitlementWithFeature;
}) => {
	// 1. If entitlement is boolean, or unlimited, or lifetime, then next reset at is null
	const isLifetime = isLifetimeEntitlement({ entitlement });
	const isUnlimited = isUnlimitedEntitlement({ entitlement });
	const isBoolean = isBooleanEntitlement({ entitlement });

	if (isLifetime || isUnlimited || isBoolean) return null;

	const { resetCycleAnchor, now } = initContext;
	const { startsAt } = initOptions ?? {};

	const nextResetAt = getCycleEnd({
		anchor: resetCycleAnchor,
		interval: entitlement.interval ?? EntInterval.Month,
		intervalCount: entitlement.interval_count,
		now: startsAt ?? now,
	});

	return nextResetAt;
};

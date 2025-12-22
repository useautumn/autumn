import {
	EntInterval,
	type EntitlementWithFeature,
	getCycleEnd,
	type InitFullCustomerProductContext,
	isBooleanEntitlement,
	isLifetimeEntitlement,
	isUnlimitedEntitlement,
} from "@autumn/shared";

export const initCustomerEntitlementNextResetAt = ({
	initContext,
	entitlement,
}: {
	initContext: InitFullCustomerProductContext;
	entitlement: EntitlementWithFeature;
}) => {
	// 1. If entitlement is boolean, or unlimited, or lifetime, then next reset at is null
	const isLifetime = isLifetimeEntitlement({ entitlement });
	const isUnlimited = isUnlimitedEntitlement({ entitlement });
	const isBoolean = isBooleanEntitlement({ entitlement });

	if (isLifetime || isUnlimited || isBoolean) return null;

	const { resetCycleAnchor, now } = initContext;

	const nextResetAt = getCycleEnd({
		anchor: resetCycleAnchor,
		interval: entitlement.interval ?? EntInterval.Month,
		intervalCount: entitlement.interval_count,
		now,
	});

	return nextResetAt;
};

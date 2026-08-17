import {
	type FullCustomerEntitlement,
	type FullSubject,
	isBooleanCusEnt,
	isUnlimitedCusEnt,
	notNullish,
} from "@autumn/shared";

/**
 * Mirrors the `looseEntitlementIsLiveSql` predicate the hydration queries apply.
 * A cached subject can still hold a loose grant that a deduction has since
 * patched to zero, so the same rule has to run on the way out of the cache —
 * otherwise customers.get reports a drained grant that customers.list filtered.
 */
const isLiveLooseEntitlement = (cusEnt: FullCustomerEntitlement): boolean =>
	(notNullish(cusEnt.balance) && cusEnt.balance !== 0) ||
	cusEnt.unlimited === true ||
	isUnlimitedCusEnt(cusEnt) ||
	isBooleanCusEnt({ cusEnt });

export const filterDrainedLooseEntitlements = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}): FullSubject => {
	const live = fullSubject.extra_customer_entitlements.filter(
		isLiveLooseEntitlement,
	);
	if (live.length === fullSubject.extra_customer_entitlements.length) {
		return fullSubject;
	}

	return { ...fullSubject, extra_customer_entitlements: live };
};

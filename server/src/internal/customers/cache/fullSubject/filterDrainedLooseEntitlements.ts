import {
	type FullSubject,
	isLiveLooseCustomerEntitlement,
} from "@autumn/shared";

/** A cached subject can hold a loose grant a deduction has since patched to zero; the read's rule runs on the way out too. */
export const filterDrainedLooseEntitlements = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}): FullSubject => {
	const live = fullSubject.extra_customer_entitlements.filter(
		(customerEntitlement) =>
			isLiveLooseCustomerEntitlement({ customerEntitlement }),
	);
	if (live.length === fullSubject.extra_customer_entitlements.length) {
		return fullSubject;
	}

	return { ...fullSubject, extra_customer_entitlements: live };
};

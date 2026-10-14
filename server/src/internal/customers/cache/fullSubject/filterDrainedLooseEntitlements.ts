import {
	type FullSubject,
	isLiveLooseCustomerEntitlement,
} from "@autumn/shared";

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

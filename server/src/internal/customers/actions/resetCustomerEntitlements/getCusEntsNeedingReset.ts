import {
	CusProductStatus,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
} from "@autumn/shared";
import { getResettableCustomerEntitlements } from "../resetCustomerEntitlementsV2/getResettableCustomerEntitlements.js";

export const getCusEntsNeedingReset = ({
	fullCus,
	now,
}: {
	fullCus: FullCustomer;
	now: number;
}): FullCusEntWithFullCusProduct[] => {
	const customerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer: fullCus,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
	});

	return getResettableCustomerEntitlements({ customerEntitlements, now });
};

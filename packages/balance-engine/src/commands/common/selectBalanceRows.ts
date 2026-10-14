import {
	type CustomerEntitlementFilters,
	fullSubjectToCustomerEntitlements,
	isLiveLooseCustomerEntitlement,
} from "@autumn/shared";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";

export const selectBalanceRows = ({
	fullSubject,
	featureId,
	customerEntitlementFilters,
	now,
}: {
	fullSubject: WorkerFullSubject;
	featureId?: string;
	customerEntitlementFilters?: CustomerEntitlementFilters;
	now: number;
}): WorkerFullCustomerEntitlementWithProduct[] =>
	fullSubjectToCustomerEntitlements({
		fullSubject,
		...(featureId ? { featureIds: [featureId] } : {}),
		customerEntitlementFilters,
		now,
	}).filter(
		(customerEntitlement) =>
			customerEntitlement.customer_product !== null ||
			isLiveLooseCustomerEntitlement({ customerEntitlement }),
	);

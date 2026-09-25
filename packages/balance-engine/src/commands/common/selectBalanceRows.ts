import {
	type CustomerEntitlementFilters,
	fullSubjectToCustomerEntitlements,
	isLiveLooseCustomerEntitlement,
} from "@autumn/shared";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";

/** The grants `customers.get` shows: a feature's (or every) row, narrowed by the filters, drained loose grants left out. Balance edits act on exactly these. */
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

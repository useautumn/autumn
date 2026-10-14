import {
	CusProductStatus,
	fullSubjectToCustomerEntitlements,
	isCustomerEntitlementInOverage,
	isCustomerProductLicenseAssignment,
	sortCusEntsForPaydown,
} from "@autumn/shared";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import type { RebalanceRequest } from "./types/rebalanceRequest.js";

type CustomerEntitlement = WorkerFullCustomerEntitlementWithProduct;

const ownerEntityOf = (customerEntitlement: CustomerEntitlement) =>
	customerEntitlement.internal_entity_id ??
	customerEntitlement.customer_product?.internal_entity_id ??
	null;

const REBALANCE_STATUSES = [CusProductStatus.Active, CusProductStatus.PastDue];

export const selectFeatureCustomerEntitlements = ({
	fullSubject,
	request,
}: {
	fullSubject: WorkerFullSubject;
	request: RebalanceRequest;
}): CustomerEntitlement[] =>
	fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [request.featureId],
		inStatuses: REBALANCE_STATUSES,
		now: request.now,
	}).filter(
		(customerEntitlement) =>
			!isCustomerProductLicenseAssignment(
				customerEntitlement.customer_product ?? undefined,
			),
	);

export const selectCustomerEntitlementsInOverage = ({
	featureCustomerEntitlements,
	purchased,
	request,
}: {
	featureCustomerEntitlements: CustomerEntitlement[];
	purchased: CustomerEntitlement;
	request: RebalanceRequest;
}): CustomerEntitlement[] => {
	const purchasedOwner = ownerEntityOf(purchased);
	return sortCusEntsForPaydown({
		customerEntitlements: featureCustomerEntitlements.filter(
			(customerEntitlement) =>
				customerEntitlement.id !== purchased.id &&
				customerEntitlement.id !== request.creditedCustomerEntitlementId &&
				ownerEntityOf(customerEntitlement) === purchasedOwner &&
				isCustomerEntitlementInOverage({ customerEntitlement }),
		),
	});
};

export const selectCreditedCustomerEntitlement = ({
	featureCustomerEntitlements,
	inOverage,
	purchased,
	request,
}: {
	featureCustomerEntitlements: CustomerEntitlement[];
	inOverage: CustomerEntitlement[];
	purchased: CustomerEntitlement;
	request: RebalanceRequest;
}): CustomerEntitlement =>
	featureCustomerEntitlements.find(
		({ id }) => id === request.creditedCustomerEntitlementId,
	) ??
	inOverage[0] ??
	purchased;

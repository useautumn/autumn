import {
	fullSubjectToUsageWindowLimits,
	isUnlimitedCustomerEntitlement,
	orgToInStatuses,
	type UsageWindowLimit,
	usageLimitFilterMatchesProperties,
} from "@autumn/shared";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import type { DeductionRequest } from "../types/deductionRequest.js";

/** The caps this request must respect: none when an unlimited row funds it or the caller overflows; filtered caps only when the event matches. */
export const resolveUsageWindowLimits = ({
	fullSubject,
	request,
	customerEntitlements,
}: {
	fullSubject: WorkerFullSubject;
	request: DeductionRequest;
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
}): UsageWindowLimit[] => {
	if (request.overageBehavior === "overflow") return [];
	if (
		customerEntitlements.some((customerEntitlement) =>
			isUnlimitedCustomerEntitlement({ customerEntitlement }),
		)
	)
		return [];

	const features = customerEntitlements.map(
		(customerEntitlement) => customerEntitlement.entitlement.feature,
	);
	return fullSubjectToUsageWindowLimits({
		fullSubject,
		featureIds: [
			...new Set([request.featureId, ...features.map((feature) => feature.id)]),
		],
		features,
		now: request.now,
		inStatuses: orgToInStatuses({ org: request.org }),
	}).filter((limit) =>
		usageLimitFilterMatchesProperties({
			filterProperties: limit.filter_properties,
			eventProperties: request.properties ?? undefined,
		}),
	);
};

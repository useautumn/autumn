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

/** The caps this request counts against: none when an unlimited row funds it; filtered caps only when the event matches. Overflow skips the gate in the draw, not the caps. */
export const resolveUsageWindowLimits = ({
	fullSubject,
	request,
	customerEntitlements,
}: {
	fullSubject: WorkerFullSubject;
	request: DeductionRequest;
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
}): UsageWindowLimit[] => {
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

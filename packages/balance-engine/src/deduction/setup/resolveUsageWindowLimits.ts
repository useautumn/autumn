import {
	FeatureType,
	fullSubjectToUsageWindowLimits,
	isUnlimitedCustomerEntitlement,
	type UsageWindowFeature,
	type UsageWindowLimit,
	usageLimitFilterMatchesProperties,
} from "@autumn/shared";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import type { DeductionSelection } from "../types/deductionRequest.js";

/** A feature funded only through credit systems has no row of its own, so the catalog never joined it: it is their metered member. */
const usageWindowFeaturesOf = ({
	selection,
	customerEntitlements,
}: {
	selection: DeductionSelection;
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
}): UsageWindowFeature[] => {
	const rowFeatures = customerEntitlements.map(
		(customerEntitlement) => customerEntitlement.entitlement.feature,
	);
	const fundedOnlyByCreditSystems =
		rowFeatures.length > 0 &&
		!rowFeatures.some((feature) => feature.id === selection.featureId);
	if (!fundedOnlyByCreditSystems) return rowFeatures;
	return [
		...rowFeatures,
		{
			id: selection.featureId,
			internal_id: selection.internalFeatureId,
			type: FeatureType.Metered,
		},
	];
};

/** The caps this selection counts against: none when an unlimited row funds it; filtered caps only when the event matches. Overflow skips the gate in the draw, not the caps. */
export const resolveUsageWindowLimits = ({
	fullSubject,
	selection,
	customerEntitlements,
}: {
	fullSubject: WorkerFullSubject;
	selection: DeductionSelection;
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
}): UsageWindowLimit[] => {
	if (!selection.countsUsageWindows) return [];
	if (
		customerEntitlements.some((customerEntitlement) =>
			isUnlimitedCustomerEntitlement({ customerEntitlement }),
		)
	)
		return [];

	const features = usageWindowFeaturesOf({ selection, customerEntitlements });
	return fullSubjectToUsageWindowLimits({
		fullSubject,
		featureIds: [
			...new Set([
				selection.featureId,
				...features.map((feature) => feature.id),
			]),
		],
		features,
		now: selection.now,
		inStatuses: selection.inStatuses,
	}).filter((limit) =>
		usageLimitFilterMatchesProperties({
			filterProperties: limit.filter_properties,
			eventProperties: selection.properties ?? undefined,
		}),
	);
};

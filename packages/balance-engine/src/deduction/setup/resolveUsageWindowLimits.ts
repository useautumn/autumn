import {
	fullSubjectToUsageWindowLimits,
	isUnlimitedCustomerEntitlement,
	type UsageWindowLimit,
	usageLimitFilterMatchesProperties,
} from "@autumn/shared";
import type {
	WorkerFullCustomerEntitlementWithProduct,
	WorkerFullSubject,
} from "../../models/subject/workerFullSubject.js";
import type { DeductionSelection } from "../types/deductionRequest.js";
import { usageWindowFeaturesOf } from "../utils/limits/usageWindowFeaturesOf.js";

/** The caps this selection counts against: none when an unlimited row funds it; filtered caps only when the event matches. Overflow skips the gate in the draw, not the caps. */
export const resolveUsageWindowLimits = ({
	fullSubject,
	selection,
	customerEntitlements,
}: {
	fullSubject: WorkerFullSubject;
	selection: DeductionSelection;
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
}): {
	usageWindowLimits: UsageWindowLimit[];
	/** A cap filtered on event properties applies or not by the event's properties. */
	filtersByProperties: boolean;
} => {
	const limits = selectionUsageWindowLimits({
		fullSubject,
		selection,
		customerEntitlements,
	});
	return {
		usageWindowLimits: limits.filter((limit) =>
			usageLimitFilterMatchesProperties({
				filterProperties: limit.filter_properties,
				eventProperties: selection.properties ?? undefined,
			}),
		),
		filtersByProperties: limits.some((limit) =>
			Boolean(limit.filter_properties),
		),
	};
};

/** Every cap on the selection's features, whatever the event's properties. */
const selectionUsageWindowLimits = ({
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

	const features = usageWindowFeaturesOf({
		featureId: selection.featureId,
		internalFeatureId: selection.internalFeatureId,
		customerEntitlements,
	});
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
	});
};

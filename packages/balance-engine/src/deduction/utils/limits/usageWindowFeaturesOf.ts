import { FeatureType, type UsageWindowFeature } from "@autumn/shared";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../../models/subject/workerFullSubject.js";

/** A feature funded only through credit systems has no row of its own, so the catalog never joined it: it is their metered member. */
export const usageWindowFeaturesOf = ({
	featureId,
	internalFeatureId,
	customerEntitlements,
}: {
	featureId: string;
	internalFeatureId: string;
	/** The rows that fund the feature: its own, and the credit systems it draws on. */
	customerEntitlements: WorkerFullCustomerEntitlementWithProduct[];
}): UsageWindowFeature[] => {
	const rowFeatures = customerEntitlements.map(
		(customerEntitlement) => customerEntitlement.entitlement.feature,
	);
	const fundedOnlyByCreditSystems =
		rowFeatures.length > 0 &&
		!rowFeatures.some((feature) => feature.id === featureId);
	if (!fundedOnlyByCreditSystems) return rowFeatures;
	return [
		...rowFeatures,
		{
			id: featureId,
			internal_id: internalFeatureId,
			type: FeatureType.Metered,
		},
	];
};

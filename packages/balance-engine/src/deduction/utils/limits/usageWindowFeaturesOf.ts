import { FeatureType, type UsageWindowFeature } from "@autumn/shared";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../../models/subject/workerFullSubject.js";

export const usageWindowFeaturesOf = ({
	featureId,
	internalFeatureId,
	customerEntitlements,
}: {
	featureId: string;
	internalFeatureId: string;
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

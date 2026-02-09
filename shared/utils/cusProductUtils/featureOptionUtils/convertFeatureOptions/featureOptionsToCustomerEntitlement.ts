import type { FullCustomerEntitlement } from "@models/cusProductModels/cusEntModels/cusEntModels";
import type { FeatureOptions } from "@models/cusProductModels/cusProductModels";

export const featureOptionsToCustomerEntitlement = ({
	featureOptions,
	customerEntitlements,
}: {
	featureOptions: FeatureOptions;
	customerEntitlements: FullCustomerEntitlement[];
}) => {
	const customerEntitlement = customerEntitlements.find(
		(customerEntitlement) =>
			customerEntitlement.entitlement.internal_feature_id ===
				featureOptions.internal_feature_id ||
			customerEntitlement.entitlement.feature.id === featureOptions.feature_id,
	);

	return customerEntitlement;
};

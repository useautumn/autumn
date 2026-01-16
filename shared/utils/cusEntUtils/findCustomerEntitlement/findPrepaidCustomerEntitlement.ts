import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import type { Feature } from "@models/featureModels/featureModels";
import { isPrepaidCusEnt } from "@utils/cusEntUtils/cusEntUtils";
import { cusEntMatchesFeature } from "@utils/cusEntUtils/filterCusEntUtils";

export const findPrepaidCustomerEntitlement = ({
	customerEntitlements,
	feature,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	feature: Feature;
}) => {
	// 1. Get prepaid customer entitlement
	return customerEntitlements.find(
		(entitlement) =>
			isPrepaidCusEnt({ cusEnt: entitlement }) &&
			cusEntMatchesFeature({ cusEnt: entitlement, feature }),
	);
};

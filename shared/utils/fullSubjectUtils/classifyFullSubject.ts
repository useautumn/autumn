import { isUsageBasedAllocatedCustomerEntitlement } from "@utils/cusEntUtils/classifyCusEntUtils.js";
import { isAllocatedFeature } from "@utils/featureUtils/classifyFeature/isAllocatedFeature.js";
import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { fullSubjectToCustomerEntitlements } from "./fullSubjectToCustomerEntitlements.js";

export const fullSubjectHasUsageBasedAllocated = ({
	fullSubject,
	features,
	inStatuses,
}: {
	fullSubject: FullSubject;
	features: Feature[];
	inStatuses?: CusProductStatus[];
}): boolean => {
	const allocatedFeatures = features.filter(isAllocatedFeature);
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: allocatedFeatures.map((feature) => feature.id),
		inStatuses,
	});

	return customerEntitlements.some((customerEntitlement) =>
		isUsageBasedAllocatedCustomerEntitlement(customerEntitlement),
	);
};

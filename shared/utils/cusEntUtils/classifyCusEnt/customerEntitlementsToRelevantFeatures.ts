import type { FullCustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import { isAnyCreditSystem } from "../../featureUtils/classifyFeature/isAnyCreditSystem.js";
import { creditSystemContainsFeature } from "../../featureUtils/creditSystemUtils.js";
import { customerEntitlementFundsFeature } from "./customerEntitlementFundsFeature.js";

/**
 * The feature plus every credit system that can fund it — the override-aware
 * twin of the catalog-only getRelevantFeatures. A credit system the customer
 * holds is judged by its EFFECTIVE schema; one they hold no balance for keeps
 * catalog membership so responses still resolve it.
 */
export const customerEntitlementsToRelevantFeatures = ({
	customerEntitlements,
	featureId,
	features,
}: {
	customerEntitlements: Pick<FullCustomerEntitlement, "entitlement">[];
	featureId: string;
	features: Feature[];
}): Feature[] => {
	const heldFundingFeatureIds = new Set<string>();
	const heldFeatureIds = new Set<string>();
	for (const customerEntitlement of customerEntitlements) {
		const heldFeature = customerEntitlement.entitlement.feature;
		if (!isAnyCreditSystem(heldFeature.type)) continue;

		heldFeatureIds.add(heldFeature.id);
		if (customerEntitlementFundsFeature({ customerEntitlement, featureId })) {
			heldFundingFeatureIds.add(heldFeature.id);
		}
	}

	return features.filter((candidate) => {
		if (candidate.id === featureId) return true;
		if (heldFeatureIds.has(candidate.id)) {
			return heldFundingFeatureIds.has(candidate.id);
		}
		return creditSystemContainsFeature({
			creditSystem: candidate,
			meteredFeatureId: featureId,
		});
	});
};

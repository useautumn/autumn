import type { FullCustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import { isAnyCreditSystem } from "../../featureUtils/classifyFeature/isAnyCreditSystem.js";
import { creditSystemContainsFeature } from "../../featureUtils/creditSystemUtils.js";
import { customerEntitlementFundsFeature } from "./customerEntitlementFundsFeature.js";

/**
 * The feature plus every credit system that can fund it, judged from the
 * entitlements a customer actually holds — the override-aware twin of the
 * catalog-only getRelevantFeatures. Works off cusEnts so both FullSubject and
 * FullCustomer callers share one implementation.
 *
 * A credit system the customer holds is judged by its EFFECTIVE schema, so an
 * override can add or remove membership. One the customer holds no balance
 * for keeps catalog membership, so responses and conversions still resolve it.
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

import type {
	FullCusEntWithFullCusProductView,
	FullSubjectView,
} from "../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { FeatureType } from "../../models/featureModels/featureEnums.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { customerEntitlementFundsFeature } from "../cusEntUtils/classifyCusEnt/customerEntitlementFundsFeature.js";
import { creditSystemContainsFeature } from "../featureUtils/creditSystemUtils.js";
import { fullSubjectToCustomerEntitlements } from "./fullSubjectToCustomerEntitlements.js";

/**
 * The credit systems that can fund a feature for this subject: catalog
 * membership adjusted by the plan-item feature_overrides on the subject's
 * entitlements. An override can add a credit system the catalog schema lacks
 * or remove one it has — judged per entitlement, so a credit system stays a
 * candidate while any of its attached entitlements funds the feature.
 * Catalog-only candidates (credit systems the subject holds no balance for)
 * keep their catalog membership, as conversion/response fallbacks.
 */
export const fullSubjectToCreditSystems = ({
	fullSubject,
	featureId,
	features,
}: {
	fullSubject: FullSubjectView;
	featureId: string;
	features: Feature[];
}): Feature[] => {
	const candidates = features.filter(
		(candidate) =>
			candidate.type === FeatureType.CreditSystem && candidate.id !== featureId,
	);
	if (candidates.length === 0) return [];
	const cusEntsByCreditSystemId = new Map<
		string,
		FullCusEntWithFullCusProductView[]
	>();
	// Only the candidates' own rows decide: selecting just those skips sorting every row the subject holds.
	for (const customerEntitlement of fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: candidates.map(({ id }) => id),
	})) {
		const entitlementFeature = customerEntitlement.entitlement.feature;
		if (entitlementFeature.type !== FeatureType.CreditSystem) continue;

		const group = cusEntsByCreditSystemId.get(entitlementFeature.id) ?? [];
		group.push(customerEntitlement);
		cusEntsByCreditSystemId.set(entitlementFeature.id, group);
	}

	return candidates.filter((candidate) => {
		const attachedCusEnts = cusEntsByCreditSystemId.get(candidate.id);
		if (attachedCusEnts?.length) {
			return attachedCusEnts.some((customerEntitlement) =>
				customerEntitlementFundsFeature({ customerEntitlement, featureId }),
			);
		}

		return creditSystemContainsFeature({
			creditSystem: candidate,
			meteredFeatureId: featureId,
		});
	});
};

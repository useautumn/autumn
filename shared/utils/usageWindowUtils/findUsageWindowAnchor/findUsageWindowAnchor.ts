import type { FullSubject } from "../../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import type { UsageWindowScope } from "../../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import { CusProductStatus } from "../../../models/cusProductModels/cusProductEnums.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import { getRelevantFeatures } from "../../featureUtils.js";
import { fullSubjectToCustomerEntitlements } from "../../fullSubjectUtils/fullSubjectToCustomerEntitlements.js";
import {
	type AnchorCandidate,
	pickAnchorCustomerEntitlementId,
} from "./pickAnchorCustomerEntitlementId.js";

// Lower rank wins in the anchor tie-break. Loose entitlements (no product) are
// treated as active grants.
const customerProductStatusToAnchorRank = (
	status: CusProductStatus | undefined,
): number => {
	switch (status) {
		case undefined:
		case CusProductStatus.Active:
			return 0;
		case CusProductStatus.PastDue:
			return 1;
		case CusProductStatus.Scheduled:
			return 2;
		case CusProductStatus.Trialing:
			return 3;
		default:
			return 999;
	}
};

const toAnchorCandidate = (
	customerEntitlement: FullCusEntWithFullCusProduct,
): AnchorCandidate => ({
	id: customerEntitlement.id,
	is_entity_scoped: customerEntitlement.internal_entity_id !== null,
	is_add_on: customerEntitlement.customer_product?.product.is_add_on ?? false,
	is_plan_backed: customerEntitlement.customer_product != null,
	status_rank: customerProductStatusToAnchorRank(
		customerEntitlement.customer_product?.status,
	),
	created_at:
		customerEntitlement.customer_product?.created_at ??
		customerEntitlement.created_at,
});

/**
 * Finds the usage window's ANCHOR entitlement: a bounds/billing-cycle
 * reference only (counters are customer-scoped rows, never entitlement-owned).
 * It supplies billing-cycle alignment for the window bounds and is stamped on
 * counter rows at creation as provenance.
 *
 * Owner preference: the capped feature's own entitlements first, then (for
 * non-credit features) entitlements of credit systems that contain it. Null
 * when no eligible entitlement exists -- the cap stays enforceable with
 * calendar-aligned bounds.
 */
export const findUsageWindowAnchor = ({
	fullSubject,
	featureId,
	features,
	isCreditSystem,
	inStatuses,
	scopeType = "customer",
}: {
	fullSubject: FullSubject;
	featureId: string;
	features: Feature[];
	isCreditSystem: boolean;
	inStatuses?: CusProductStatus[];
	scopeType?: UsageWindowScope;
}): {
	anchorCustomerEntitlementId: string | null;
	anchorCustomerEntitlement?: FullCusEntWithFullCusProduct;
} => {
	const containingCreditSystemFeatureIds = getRelevantFeatures({
		features,
		featureId,
	})
		.map((feature) => feature.id)
		.filter((relevantFeatureId) => relevantFeatureId !== featureId);
	const ownerFeatureIdsByPreference = isCreditSystem
		? [[featureId]]
		: [[featureId], containingCreditSystemFeatureIds];

	for (const ownerFeatureIds of ownerFeatureIdsByPreference) {
		if (ownerFeatureIds.length === 0) continue;

		const candidateEntitlements = fullSubjectToCustomerEntitlements({
			fullSubject,
			featureIds: ownerFeatureIds,
			inStatuses,
		});
		const anchorCustomerEntitlementId = pickAnchorCustomerEntitlementId({
			candidates: candidateEntitlements.map(toAnchorCandidate),
			scopeType,
		});

		if (anchorCustomerEntitlementId) {
			return {
				anchorCustomerEntitlementId,
				anchorCustomerEntitlement: candidateEntitlements.find(
					(customerEntitlement) =>
						customerEntitlement.id === anchorCustomerEntitlementId,
				),
			};
		}
	}

	return { anchorCustomerEntitlementId: null };
};

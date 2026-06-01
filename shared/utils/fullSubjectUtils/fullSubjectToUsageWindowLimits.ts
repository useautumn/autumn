import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import type {
	UsageWindowDimension,
	UsageWindowLimit,
} from "../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import { FeatureType } from "../../models/featureModels/featureEnums.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { getRelevantFeatures } from "../featureUtils.js";
import { buildUsageWindowKey } from "../usageWindowUtils/buildUsageWindowKey.js";
import { getUsageWindowBounds } from "../usageWindowUtils/getUsageWindowBounds.js";
import {
	type AnchorCandidate,
	pickAnchorCustomerEntitlementId,
} from "../usageWindowUtils/pickAnchorCustomerEntitlementId.js";
import { fullSubjectToCustomerEntitlements } from "./fullSubjectToCustomerEntitlements.js";

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
	status_rank: customerProductStatusToAnchorRank(
		customerEntitlement.customer_product?.status,
	),
	created_at:
		customerEntitlement.customer_product?.created_at ??
		customerEntitlement.created_at,
});

/**
 * Resolves the enforceable usage-window limits for the requested features from a
 * FullSubject. The windowed cap is configured as the optional `usage_window`
 * sub-object on a `spend_limit` entry (same JSON as the overage cap; the two
 * caps are independent). v1 reads ONLY customer-scoped spend_limits; entity
 * usage windows are out of scope. Only `usage_window.enabled` entries are
 * enforced (independent of the entry-level `enabled`, which gates the overage cap).
 *
 * A cap on a credit-system feature targets the credit pool (`balance`
 * dimension); a cap on any other feature targets that feature's usage
 * (`metered_feature` dimension). Window bounds + key are computed from `now`.
 *
 * Each limit also gets a single owning `anchor_customer_entitlement_id`,
 * resolved deduction-order-independently so one counter never splits across
 * pools. Null anchor means no eligible owner; the enforcement layer fails closed.
 */
export const fullSubjectToUsageWindowLimits = ({
	fullSubject,
	featureIds,
	features,
	now,
}: {
	fullSubject: FullSubject;
	featureIds: string[];
	features: Feature[];
	now: number;
}): UsageWindowLimit[] => {
	// v1: customer-scoped caps only; entity-scoped usage windows are out of scope.
	const customerSpendLimits = fullSubject.customer.spend_limits ?? [];
	const limits: UsageWindowLimit[] = [];

	for (const featureId of [...new Set(featureIds)]) {
		const spendLimit = customerSpendLimits.find(
			(candidate) =>
				candidate.feature_id === featureId &&
				candidate.usage_window?.enabled === true,
		);
		const usageWindow = spendLimit?.usage_window;
		if (!usageWindow) continue;

		const scopeType = "customer" as const;
		const entityId = null;
		const internalEntityId = null;

		const isCreditSystem =
			features.find((feature) => feature.id === featureId)?.type ===
			FeatureType.CreditSystem;
		const dimensionType: UsageWindowDimension = isCreditSystem
			? "balance"
			: "metered_feature";
		const dimensionFeatureId = isCreditSystem ? null : featureId;

		// Balance dim is owned by the credit-system entitlement. Metered dim
		// prefers the member feature's own entitlement, then falls back to a
		// credit system that contains it.
		const containingCreditSystemFeatureIds = getRelevantFeatures({
			features,
			featureId,
		})
			.map((feature) => feature.id)
			.filter((relevantFeatureId) => relevantFeatureId !== featureId);
		const ownerFeatureIdsByPreference = isCreditSystem
			? [[featureId]]
			: [[featureId], containingCreditSystemFeatureIds];

		let anchorId: string | null = null;
		let anchorFeatureId: string | null = null;
		for (const ownerFeatureIds of ownerFeatureIdsByPreference) {
			if (ownerFeatureIds.length === 0) continue;
			const candidateEntitlements = fullSubjectToCustomerEntitlements({
				fullSubject,
				featureIds: ownerFeatureIds,
			});
			anchorId = pickAnchorCustomerEntitlementId({
				candidates: candidateEntitlements.map(toAnchorCandidate),
				scopeType,
			});
			if (anchorId) {
				anchorFeatureId =
					candidateEntitlements.find(
						(customerEntitlement) => customerEntitlement.id === anchorId,
					)?.feature_id ?? null;
				break;
			}
		}

		const { windowStartAt, windowEndAt } = getUsageWindowBounds({
			interval: usageWindow.interval,
			now,
		});

		limits.push({
			feature_id: featureId,
			key: buildUsageWindowKey({
				scopeType,
				internalEntityId,
				dimensionType,
				dimensionFeatureId,
				interval: usageWindow.interval,
				windowStartAt,
			}),
			dimension_type: dimensionType,
			dimension_feature_id: dimensionFeatureId,
			scope_type: scopeType,
			entity_id: entityId,
			internal_entity_id: internalEntityId,
			interval: usageWindow.interval,
			window_start_at: windowStartAt,
			window_end_at: windowEndAt,
			limit: usageWindow.limit,
			anchor_customer_entitlement_id: anchorId,
			anchor_feature_id: anchorFeatureId,
		});
	}

	return limits;
};

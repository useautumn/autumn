import type { DbUsageLimit } from "../../../models/cusModels/billingControls/usageLimit.js";
import type { FullSubject } from "../../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { UsageWindowLimit } from "../../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { CusProductStatus } from "../../../models/cusProductModels/cusProductEnums.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import { resetIntvToEntIntv } from "../../productV2Utils/productItemUtils/convertProductItem/planItemIntervals.js";
import { usageLimitFilterKey } from "../../../models/cusModels/billingControls/usageLimit.js";
import { buildUsageWindowKey } from "../buildUsageWindowKey.js";
import { findUsageWindowAnchor } from "../findUsageWindowAnchor/findUsageWindowAnchor.js";
import { getUsageWindowAnchorTimestamp } from "../getUsageWindowAnchorTimestamp.js";
import { getUsageWindowBounds } from "../getUsageWindowBounds.js";
import { getUsageWindowDimension } from "./getUsageWindowDimension.js";

/** Non-null = the cap is the entity's own: its counter is entity-scoped. */
export type UsageWindowEntityScope = {
	entityId: string | null;
	internalEntityId: string;
};

/**
 * Resolves one stored usage-limit entry into the enforceable UsageWindowLimit
 * handed to the deduction script. The entry's ResetInterval converts to the
 * internal EntInterval here -- the single edge between the API/storage
 * vocabulary and the window internals. Window bounds align to the customer's
 * billing cycle via the anchor entitlement when one exists, else UTC calendar.
 */
export const usageLimitToUsageWindowLimit = ({
	fullSubject,
	usageLimit,
	feature,
	features,
	now,
	inStatuses,
	entityScope = null,
}: {
	fullSubject: FullSubject;
	usageLimit: DbUsageLimit;
	feature: Feature;
	features: Feature[];
	now: number;
	inStatuses?: CusProductStatus[];
	entityScope?: UsageWindowEntityScope | null;
}): UsageWindowLimit | null => {
	// No catalog internal_id => unstorable counter row (NOT NULL FK); the cap
	// is unenforceable, so skip it.
	if (feature.internal_id == null) return null;

	const interval = resetIntvToEntIntv({ resetIntv: usageLimit.interval });
	if (interval == null) return null;

	const { dimensionType, dimensionFeatureId } = getUsageWindowDimension({
		feature,
	});

	const scopeType = entityScope ? "entity" : "customer";
	const { anchorCustomerEntitlementId, anchorCustomerEntitlement } =
		findUsageWindowAnchor({
			fullSubject,
			featureId: feature.id,
			features,
			isCreditSystem: dimensionType === "balance",
			inStatuses,
			scopeType,
		});

	const { windowStartAt, windowEndAt } = getUsageWindowBounds({
		interval,
		now,
		anchor: getUsageWindowAnchorTimestamp({ anchorCustomerEntitlement }),
	});

	const filterKey = usageLimitFilterKey(usageLimit.filter);

	return {
		feature_id: feature.id,
		internal_feature_id: feature.internal_id,
		internal_customer_id: fullSubject.internalCustomerId,
		key: buildUsageWindowKey({
			scopeType,
			internalEntityId: entityScope?.internalEntityId ?? null,
			dimensionType,
			dimensionFeatureId,
			interval,
			windowStartAt,
			filterKey,
		}),
		dimension_type: dimensionType,
		dimension_feature_id: dimensionFeatureId,
		scope_type: scopeType,
		entity_id: entityScope?.entityId ?? null,
		internal_entity_id: entityScope?.internalEntityId ?? null,
		filter_key: filterKey || null,
		filter_properties: usageLimit.filter?.properties ?? null,
		interval,
		window_start_at: windowStartAt,
		window_end_at: windowEndAt,
		limit: usageLimit.limit,
		anchor_customer_entitlement_id: anchorCustomerEntitlementId,
	};
};

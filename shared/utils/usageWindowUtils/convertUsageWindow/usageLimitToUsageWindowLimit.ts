import type { DbUsageLimit } from "../../../models/cusModels/billingControls/usageLimit.js";
import { usageLimitFilterKey } from "../../../models/cusModels/billingControls/usageLimit.js";
import type {
	BillingControlSubjectView,
	CustomerEntitlementRowView,
	CustomerProductWithPricesView,
} from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import type {
	UsageWindowFeature,
	UsageWindowLimit,
} from "../../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { CusProductStatus } from "../../../models/cusProductModels/cusProductEnums.js";
import type { PlanControlCustomerProduct } from "../../fullSubjectUtils/planBillingControlUtils.js";
import { resetIntvToEntIntv } from "../../productV2Utils/productItemUtils/convertProductItem/planItemIntervals.js";
import { buildUsageWindowKey } from "../buildUsageWindowKey.js";
import { findUsageWindowAnchor } from "../findUsageWindowAnchor/findUsageWindowAnchor.js";
import { getUsageWindowAnchorTimestamp } from "../getUsageWindowAnchorTimestamp.js";
import { getUsageWindowBounds } from "../getUsageWindowBounds.js";
import { getUsageWindowDimension } from "./getUsageWindowDimension.js";

export type UsageWindowEntityScope = {
	entityId: string | null;
	internalEntityId: string;
};

export const usageLimitToUsageWindowLimit = <
	CE extends CustomerEntitlementRowView,
	CP extends PlanControlCustomerProduct & CustomerProductWithPricesView,
>({
	fullSubject,
	usageLimit,
	feature,
	now,
	inStatuses,
	entityScope = null,
}: {
	fullSubject: BillingControlSubjectView<CE, CP>;
	usageLimit: DbUsageLimit;
	feature: UsageWindowFeature;
	now: number;
	inStatuses?: CusProductStatus[];
	entityScope?: UsageWindowEntityScope | null;
}): UsageWindowLimit | null => {
	if (feature.internal_id == null) return null;

	const interval = resetIntvToEntIntv({ resetIntv: usageLimit.interval });
	if (interval == null) return null;

	const { dimensionType, dimensionFeatureId } = getUsageWindowDimension({
		feature,
	});

	const scopeType = entityScope ? "entity" : "customer";
	const anchorMode = usageLimit.anchor ?? "billing_cycle";
	const { anchorCustomerEntitlementId, anchorCustomerEntitlement } =
		anchorMode === "utc"
			? {
					anchorCustomerEntitlementId: null,
					anchorCustomerEntitlement: undefined,
				}
			: findUsageWindowAnchor({
					fullSubject,
					featureId: feature.id,
					isCreditSystem: dimensionType === "balance",
					inStatuses,
					scopeType,
				});

	const { windowStartAt, windowEndAt } = getUsageWindowBounds({
		interval,
		now,
		anchor: getUsageWindowAnchorTimestamp({
			anchorCustomerEntitlement,
			windowInterval: interval,
		}),
	});

	const filterKey = usageLimitFilterKey(usageLimit.filter);

	return {
		feature_id: feature.id,
		internal_feature_id: feature.internal_id,
		internal_customer_id: fullSubject.customer.internal_id,
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
		anchor_mode: anchorMode,
	};
};

import type { DbUsageLimit } from "../../models/cusModels/billingControls/customerBillingControls.js";
import { usageLimitFilterKey } from "../../models/cusModels/billingControls/usageLimit.js";
import type {
	BillingControlSubjectView,
	CustomerEntitlementRowView,
	CustomerProductWithPricesView,
} from "../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import type {
	UsageWindowFeature,
	UsageWindowLimit,
} from "../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import { usageLimitToUsageWindowLimit } from "../usageWindowUtils/convertUsageWindow/usageLimitToUsageWindowLimit.js";
import {
	fullSubjectToPlanProducts,
	type PlanControlCustomerProduct,
	resolveBillingControl,
} from "./planBillingControlUtils.js";

export const fullSubjectToUsageWindowLimits = <
	CE extends CustomerEntitlementRowView,
	CP extends PlanControlCustomerProduct & CustomerProductWithPricesView,
>({
	fullSubject,
	featureIds,
	features,
	now,
	inStatuses,
}: {
	fullSubject: BillingControlSubjectView<CE, CP>;
	featureIds: string[];
	features: UsageWindowFeature[];
	now: number;
	inStatuses?: CusProductStatus[];
}): UsageWindowLimit[] => {
	const entityUsageLimits = fullSubject.entity?.usage_limits ?? [];
	const customerUsageLimits = fullSubject.customer.usage_limits ?? [];
	const planProducts = fullSubjectToPlanProducts({ fullSubject });
	const planUsageLimits = planProducts.flatMap(
		(customerProduct) => customerProduct.product?.usage_limits ?? [],
	);
	const limits: UsageWindowLimit[] = [];

	for (const featureId of [...new Set(featureIds)]) {
		const filterKeys = new Set(
			[entityUsageLimits, customerUsageLimits, planUsageLimits].flatMap(
				(list) =>
					list
						.filter((candidate) => candidate.feature_id === featureId)
						.map((candidate) => usageLimitFilterKey(candidate.filter)),
			),
		);

		for (const filterKey of filterKeys) {
			const matchesGroup = (candidate: DbUsageLimit) =>
				candidate.feature_id === featureId &&
				usageLimitFilterKey(candidate.filter) === filterKey;

			const entityUsageLimit = entityUsageLimits.find(matchesGroup);
			const usageLimit = resolveBillingControl({
				controlLists: [entityUsageLimits, customerUsageLimits],
				customerProducts: planProducts,
				controlKey: "usage_limits",
				matches: matchesGroup,
				now,
				inStatuses,
			});
			if (!usageLimit || usageLimit.enabled === false) continue;

			const feature = features.find((candidate) => candidate.id === featureId);
			if (!feature) continue;

			const limit = usageLimitToUsageWindowLimit({
				fullSubject,
				usageLimit,
				feature,
				now,
				inStatuses,
				entityScope:
					entityUsageLimit && fullSubject.entity
						? {
								entityId: fullSubject.entity.id,
								internalEntityId: fullSubject.entity.internal_id,
							}
						: null,
			});
			if (limit) limits.push(limit);
		}
	}

	return limits;
};

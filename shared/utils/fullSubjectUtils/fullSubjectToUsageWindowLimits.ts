import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { UsageWindowLimit } from "../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { usageLimitToUsageWindowLimit } from "../usageWindowUtils/convertUsageWindow/usageLimitToUsageWindowLimit.js";
import type { DbUsageLimit } from "../../models/cusModels/billingControls/customerBillingControls.js";
import { usageLimitFilterKey } from "../../models/cusModels/billingControls/usageLimit.js";
import {
	fullSubjectToPlanProducts,
	resolveBillingControl,
} from "./planBillingControlUtils.js";

/**
 * Resolves the enforceable usage-window limits for the requested features.
 * ONE cap per (feature, filter identity) per subject: within each filter
 * group, inheritance mirrors spend limits (fullSubjectToSpendLimitByFeatureId)
 * -- the entity's own `usage_limits` entry wins (entity-scoped counter), else
 * the customer's, else the plan's. Filtered and unfiltered caps on the same
 * feature are independent counters, not sub-budgets of each other.
 */
export const fullSubjectToUsageWindowLimits = ({
	fullSubject,
	featureIds,
	features,
	now,
	inStatuses,
}: {
	fullSubject: FullSubject;
	featureIds: string[];
	features: Feature[];
	now: number;
	// Status filter for entitlement lookups; pass the caller's orgToInStatuses so
	// the cap's anchor resolution matches what the deduction can act on.
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
			const usageLimit = resolveBillingControl<DbUsageLimit, "usage_limits">({
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
				features,
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

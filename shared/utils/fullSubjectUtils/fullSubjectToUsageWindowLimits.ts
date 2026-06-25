import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { UsageWindowLimit } from "../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { usageLimitToUsageWindowLimit } from "../usageWindowUtils/convertUsageWindow/usageLimitToUsageWindowLimit.js";
import type { DbUsageLimit } from "../../models/cusModels/billingControls/customerBillingControls.js";
import {
	fullSubjectToPlanProducts,
	resolveBillingControl,
} from "./planBillingControlUtils.js";

/**
 * Resolves the enforceable usage-window limits for the requested features.
 * Exactly ONE cap per feature per subject, mirroring spend-limit inheritance
 * (fullSubjectToSpendLimitByFeatureId): the entity's own `usage_limits` entry
 * wins (entity-scoped counter), else the customer's entry fills the gap at
 * customer scope (the shared aggregate counter).
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
	const limits: UsageWindowLimit[] = [];

	for (const featureId of [...new Set(featureIds)]) {
		const entityUsageLimit = entityUsageLimits.find(
			(candidate) => candidate.feature_id === featureId,
		);
		const usageLimit = resolveBillingControl<DbUsageLimit, "usage_limits">({
			controlLists: [entityUsageLimits, customerUsageLimits],
			customerProducts: fullSubjectToPlanProducts({ fullSubject }),
			controlKey: "usage_limits",
			matches: (candidate) => candidate.feature_id === featureId,
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

	return limits;
};

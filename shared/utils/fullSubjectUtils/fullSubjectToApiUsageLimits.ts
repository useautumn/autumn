import type { ApiUsageLimit } from "../../api/billingControls/usageLimit.js";
import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import type { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { usageLimitFilterKey } from "../../models/cusModels/billingControls/usageLimit.js";
import { getCurrentUsageWindowUsage } from "../usageWindowUtils/getCurrentUsageWindowUsage.js";
import { fullSubjectToUsageWindowLimits } from "./fullSubjectToUsageWindowLimits.js";

/**
 * Response decorator for one arm's stored usage limits: each entry plus
 * `usage` -- the amount already consumed in the active window, read from the
 * subject's usage-window counters. `source` is explicit (not inferred from
 * subjectType) because check builds the CUSTOMER arm from an entity subject.
 */
export const fullSubjectToApiUsageLimits = ({
	fullSubject,
	features,
	now = Date.now(),
	inStatuses,
	source = "customer",
}: {
	fullSubject: FullSubject;
	features: Feature[];
	now?: number;
	inStatuses?: CusProductStatus[];
	source?: "customer" | "entity";
}): ApiUsageLimit[] | undefined => {
	const usageLimits =
		source === "entity"
			? fullSubject.entity?.usage_limits
			: fullSubject.customer.usage_limits;
	if (usageLimits == null) return undefined;

	const resolvedLimits = fullSubjectToUsageWindowLimits({
		fullSubject,
		featureIds: usageLimits.map((usageLimit) => usageLimit.feature_id),
		features,
		now,
		inStatuses,
	});
	const usageWindows = fullSubject.usage_windows ?? [];

	return usageLimits.map((usageLimit) => {
		const filterKey = usageLimitFilterKey(usageLimit.filter);
		const resolved = resolvedLimits.find(
			(limit) =>
				limit.feature_id === usageLimit.feature_id &&
				(limit.filter_key || "") === filterKey,
		);
		if (!resolved) return usageLimit;

		return {
			...usageLimit,
			usage: getCurrentUsageWindowUsage({ usageWindows, limit: resolved, now }),
		};
	});
};

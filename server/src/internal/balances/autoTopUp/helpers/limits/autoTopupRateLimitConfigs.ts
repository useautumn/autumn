import type { AutoTopup, Organization } from "@autumn/shared";
import { getOrgAutoTopupAttemptLimit } from "@/internal/misc/edgeConfig/orgLimitsStore.js";

export type AutoTopupWindowLimitConfig = {
	limit: number;
	interval: "minute" | "hour" | "day" | "week" | "month";
	interval_count: number;
};

export const DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT: AutoTopupWindowLimitConfig = {
	limit: 2,
	interval: "minute",
	interval_count: 10,
};

export const DEFAULT_AUTO_TOPUP_FAILED_ATTEMPT_LIMIT: AutoTopupWindowLimitConfig =
	{
		limit: 1,
		interval: "hour",
		interval_count: 1,
	};

export const getAutoTopupRateLimitConfigs = ({
	autoTopupConfig,
	org,
}: {
	autoTopupConfig: AutoTopup;
	org: Pick<Organization, "id" | "slug">;
}) => {
	return {
		purchaseLimit: autoTopupConfig.purchase_limit,
		attemptLimit: {
			...DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT,
			limit:
				getOrgAutoTopupAttemptLimit({ orgId: org.id, orgSlug: org.slug }) ??
				DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT.limit,
		},
		failedAttemptLimit: DEFAULT_AUTO_TOPUP_FAILED_ATTEMPT_LIMIT,
	};
};

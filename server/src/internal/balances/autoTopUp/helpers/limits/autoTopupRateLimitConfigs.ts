import type { AutoTopup, Organization } from "@autumn/shared";
import { getOrgRateLimitOverride } from "@/internal/misc/rateLimiter/rateLimitOverridesStore.js";

export const AUTO_TOPUP_ATTEMPTS_RATE_LIMIT = "auto_topup_attempts";

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
				getOrgRateLimitOverride({
					orgId: org.id,
					orgSlug: org.slug,
					type: AUTO_TOPUP_ATTEMPTS_RATE_LIMIT,
				}) ?? DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT.limit,
		},
		failedAttemptLimit: DEFAULT_AUTO_TOPUP_FAILED_ATTEMPT_LIMIT,
	};
};

import type { AutoTopup, OrgConfig } from "@autumn/shared";

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
	orgConfig,
}: {
	autoTopupConfig: AutoTopup;
	orgConfig: OrgConfig;
}) => {
	return {
		purchaseLimit: autoTopupConfig.purchase_limit,
		attemptLimit: {
			...DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT,
			limit:
				orgConfig.auto_topup_attempt_limit ??
				DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT.limit,
		},
		failedAttemptLimit: DEFAULT_AUTO_TOPUP_FAILED_ATTEMPT_LIMIT,
	};
};

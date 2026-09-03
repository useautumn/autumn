import type { DbUsageAlertLike } from "../../usageAlert.js";
import type { DbUsageLimitLike } from "../../usageLimit.js";

type FeatureKeyedControl = { feature_id?: string };

export type ControlByKey = {
	auto_topups: FeatureKeyedControl;
	spend_limits: FeatureKeyedControl;
	usage_limits: Pick<DbUsageLimitLike, "feature_id" | "filter">;
	usage_alerts: DbUsageAlertLike;
	overage_allowed: FeatureKeyedControl;
};

import type { DbUsageAlertLike } from "../../usageAlert.js";
import type { DbUsageLimitLike } from "../../usageLimit.js";

type FeatureKeyedControl = { feature_id?: string };

type ControlByKey = {
	auto_topups: FeatureKeyedControl;
	spend_limits: FeatureKeyedControl;
	usage_limits: Pick<DbUsageLimitLike, "feature_id" | "filter">;
	usage_alerts: DbUsageAlertLike;
	overage_allowed: FeatureKeyedControl;
};

export type DuplicateCheckedControlKey = keyof ControlByKey;

export type DuplicateCheckedControl<TKey extends DuplicateCheckedControlKey> =
	ControlByKey[TKey];

/** The control lists the duplicate check reads; every billing-controls schema satisfies this. */
export type DuplicateCheckedBillingControls = {
	[TKey in DuplicateCheckedControlKey]?: Array<ControlByKey[TKey]> | null;
};

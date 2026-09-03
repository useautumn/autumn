import { isUsageLimitBasisAlert } from "../../models/cusModels/billingControls/classify/isUsageLimitBasisAlert.js";
import { usageAlertTargetLimitIdentity } from "../../models/cusModels/billingControls/identity/usageAlertTargetLimitIdentity.js";
import { usageLimitIdentity } from "../../models/cusModels/billingControls/identity/usageLimitIdentity.js";
import type { DbUsageAlertLike } from "../../models/cusModels/billingControls/usageAlert.js";
import type { DbUsageLimitLike } from "../../models/cusModels/billingControls/usageLimit.js";

// Disabled limits still count: disabling a cap makes its alert dormant, not invalid.
export const filterUnresolvableUsageLimitAlerts = ({
	usageAlerts,
	usageLimitLists,
}: {
	usageAlerts: DbUsageAlertLike[];
	usageLimitLists: Array<
		Array<Pick<DbUsageLimitLike, "feature_id" | "filter">> | null | undefined
	>;
}): Array<{ index: number; usageAlert: DbUsageAlertLike }> => {
	const limitIdentities = new Set(
		usageLimitLists.flatMap((list) => (list ?? []).map(usageLimitIdentity)),
	);

	return usageAlerts.flatMap((usageAlert, index) =>
		isUsageLimitBasisAlert(usageAlert) &&
		!limitIdentities.has(usageAlertTargetLimitIdentity(usageAlert))
			? [{ index, usageAlert }]
			: [],
	);
};

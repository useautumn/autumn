import type { UsageWindowLimit } from "../../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { UsageWindow } from "../../../models/cusProductModels/cusEntModels/usageWindowTable.js";
import { usageWindowMatchesLimit } from "../classifyUsageWindow/usageWindowMatchesLimit.js";

/** The resolved limit governing a counter row, if one is armed for its scope. */
export const findUsageWindowLimitByWindow = ({
	limits,
	usageWindow,
}: {
	limits: UsageWindowLimit[];
	usageWindow: UsageWindow;
}): UsageWindowLimit | undefined =>
	limits.find((limit) => usageWindowMatchesLimit({ usageWindow, limit }));

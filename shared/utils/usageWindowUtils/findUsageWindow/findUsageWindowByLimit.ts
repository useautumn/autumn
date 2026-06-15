import type { UsageWindowLimit } from "../../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { UsageWindow } from "../../../models/cusProductModels/cusEntModels/usageWindowTable.js";
import { usageWindowMatchesLimit } from "../classifyUsageWindow/usageWindowMatchesLimit.js";

/** The limit's counter row (one mutable row per scope), if it exists yet. */
export const findUsageWindowByLimit = ({
	usageWindows,
	limit,
}: {
	usageWindows: UsageWindow[];
	limit: UsageWindowLimit;
}): UsageWindow | undefined =>
	usageWindows.find((usageWindow) =>
		usageWindowMatchesLimit({ usageWindow, limit }),
	);

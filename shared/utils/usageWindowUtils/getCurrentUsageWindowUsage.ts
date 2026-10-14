import type { UsageWindowLimit } from "../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { UsageWindow } from "../../models/cusProductModels/cusEntModels/usageWindowTable.js";
import { isSameUsageWindow } from "./classifyUsageWindow/isSameUsageWindow.js";
import { findUsageWindowByLimit } from "./findUsageWindow/findUsageWindowByLimit.js";

export const getCurrentUsageWindowUsage = ({
	usageWindows,
	limit,
	now = Date.now(),
}: {
	usageWindows: UsageWindow[];
	limit: UsageWindowLimit;
	now?: number;
}): number => {
	const scopeRow = findUsageWindowByLimit({ usageWindows, limit });
	if (
		!scopeRow ||
		Number(scopeRow.window_end_at) <= now ||
		!isSameUsageWindow({ usageWindow: scopeRow, window: limit })
	)
		return 0;

	const usage = Number(scopeRow.usage);
	return Number.isFinite(usage) ? Math.max(0, usage) : 0;
};

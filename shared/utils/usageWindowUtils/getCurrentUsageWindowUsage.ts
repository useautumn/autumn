import type { UsageWindowLimit } from "../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { UsageWindow } from "../../models/cusProductModels/cusEntModels/usageWindowTable.js";
import { findUsageWindowByLimit } from "./findUsageWindow/findUsageWindowByLimit.js";

/**
 * Usage already consumed in the limit's current window: the scope's single
 * mutable counter row, derived as 0 when its stored window closed OR no
 * longer matches the current derivation (the lazy roll persists the zero;
 * reads never trust a dead count).
 */
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
		Number(scopeRow.window_start_at) !== limit.window_start_at
	)
		return 0;

	const usage = Number(scopeRow.usage);
	return Number.isFinite(usage) ? Math.max(0, usage) : 0;
};

import type {
	UsageWindowLimit,
	UsageWindowRoll,
} from "../../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { UsageWindow } from "../../../models/cusProductModels/cusEntModels/usageWindowTable.js";
import { isSameUsageWindow } from "../classifyUsageWindow/isSameUsageWindow.js";
import { findUsageWindowLimitByWindow } from "../findUsageWindow/findUsageWindowLimitByWindow.js";

export const usageWindowsToRolls = ({
	usageWindows,
	limits,
	now,
}: {
	usageWindows: UsageWindow[];
	limits: UsageWindowLimit[];
	now: number;
}): UsageWindowRoll[] => {
	const rolls: UsageWindowRoll[] = [];

	for (const usageWindow of usageWindows) {
		const expired = Number(usageWindow.window_end_at) <= now;

		const limit = findUsageWindowLimitByWindow({ limits, usageWindow });

		const target = limit
			? {
					window_start_at: limit.window_start_at,
					window_end_at: limit.window_end_at,
					anchor_customer_entitlement_id: limit.anchor_customer_entitlement_id,
				}
			: {
					window_start_at: Number(usageWindow.window_start_at),
					window_end_at: Number(usageWindow.window_end_at),
					anchor_customer_entitlement_id:
						usageWindow.anchor_customer_entitlement_id ?? null,
				};

		const boundsChanged =
			Number(usageWindow.window_start_at) !== target.window_start_at ||
			Number(usageWindow.window_end_at) !== target.window_end_at;
		const windowMoved = !isSameUsageWindow({ usageWindow, window: target });
		const anchorMoved =
			(usageWindow.anchor_customer_entitlement_id ?? null) !==
			target.anchor_customer_entitlement_id;

		if (!expired && !boundsChanged && !anchorMoved) continue;

		rolls.push({
			id: usageWindow.id,
			feature_id: usageWindow.feature_id,
			internal_entity_id: usageWindow.internal_entity_id ?? null,
			filter_key: usageWindow.filter_key ?? null,
			zero_usage: expired || windowMoved,
			...target,
		});
	}

	return rolls;
};

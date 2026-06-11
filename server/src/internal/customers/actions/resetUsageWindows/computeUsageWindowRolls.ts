import {
	findUsageWindowLimitByWindow,
	type UsageWindow,
	type UsageWindowLimit,
} from "@autumn/shared";

export type UsageWindowRoll = {
	id: string;
	feature_id: string;
	internal_entity_id: string | null;
	/** True when the stored window closed: the count must zero. A roll never
	 *  writes a count otherwise, so it can't clobber a concurrent deduction. */
	zero_usage: boolean;
	window_start_at: number;
	window_end_at: number;
	anchor_customer_entitlement_id: string | null;
};

/**
 * Decides, per counter row, whether it needs rolling. A count is only valid
 * within the exact window stamped on it; the anchor is provenance, so an
 * anchor-only re-point keeps the count:
 *
 *   expired | window moved | anchor moved | result
 *   --------+--------------+--------------+---------------------------------
 *   no      | no           | no           | no roll (the common case)
 *   no      | no           | yes          | re-point anchor, count kept
 *   no      | yes          | any          | re-bound, count zeroed (plan change)
 *   yes     | any          | any          | re-bound, count zeroed (period over)
 *   yes     | (no limit)   | --           | bounds kept, count zeroed (entity rows, v1)
 *
 * "Window moved" compares the row's bounds against its limit's CURRENT
 * derivation (anchor ent's cycle). Entity-scoped rows have no resolvable
 * limit in v1, so their bounds can't re-derive -- but an expired count must
 * still zero.
 */
export const computeUsageWindowRolls = ({
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

		const windowMoved =
			Number(usageWindow.window_start_at) !== target.window_start_at ||
			Number(usageWindow.window_end_at) !== target.window_end_at;
		const anchorMoved =
			(usageWindow.anchor_customer_entitlement_id ?? null) !==
			target.anchor_customer_entitlement_id;

		if (!expired && !windowMoved && !anchorMoved) continue;

		rolls.push({
			id: usageWindow.id,
			feature_id: usageWindow.feature_id,
			internal_entity_id: usageWindow.internal_entity_id ?? null,
			// A count never survives its stamped window; an anchor-only
			// re-point (e.g. an ent recreated with the same cycle) keeps it.
			zero_usage: expired || windowMoved,
			...target,
		});
	}

	return rolls;
};

import type { ApiBalanceV1 } from "@api/customers/cusFeatures/apiBalanceV1.js";
import { ResetInterval } from "@models/productModels/intervals/resetInterval.js";

const dateToEpochMs = (date: Date | null) => date?.getTime() ?? null;

/** Base balance fixture with matching top-level values and one simple breakdown row. */
export const baseBalance = ({
	featureId = "credits",
	granted = 0,
	remaining = granted,
	reset = { interval: ResetInterval.Month },
	nextResetAt = null,
	planId = null,
	usage = granted - remaining,
}: {
	featureId?: string;
	granted?: number;
	remaining?: number;
	usage?: number;
	nextResetAt?: Date | null;
	reset?: { interval?: ResetInterval; intervalCount?: number } | null;
	planId?: string | null;
} = {}): ApiBalanceV1 => {
	const nextResetAtMs = dateToEpochMs(nextResetAt);
	const resetValue = reset
		? {
				interval: reset.interval ?? ResetInterval.Month,
				interval_count: reset.intervalCount,
				resets_at: nextResetAtMs,
			}
		: null;

	return {
		object: "balance",
		feature_id: featureId,
		granted,
		remaining,
		usage,
		unlimited: false,
		overage_allowed: false,
		max_purchase: null,
		next_reset_at: nextResetAtMs,
		breakdown: [
			{
				object: "balance_breakdown",
				id: `balance_${featureId}`,
				plan_id: planId,
				included_grant: granted,
				prepaid_grant: 0,
				remaining,
				usage,
				unlimited: false,
				reset: resetValue,
				price: null,
				expires_at: null,
				overage: 0,
			},
		],
	};
};

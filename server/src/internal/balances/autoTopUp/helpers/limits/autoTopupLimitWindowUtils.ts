import {
	type AutoTopupPurchaseLimit,
	addInterval,
	EntInterval,
	type InsertAutoTopupLimitState,
} from "@autumn/shared";
import type { AutoTopupWindowLimitConfig } from "./autoTopupRateLimitConfigs.js";

const intervalToEntInterval = ({
	interval,
}: {
	interval:
		| AutoTopupPurchaseLimit["interval"]
		| AutoTopupWindowLimitConfig["interval"];
}): EntInterval => {
	switch (interval) {
		case "minute":
			return EntInterval.Minute;
		case "hour":
			return EntInterval.Hour;
		case "day":
			return EntInterval.Day;
		case "week":
			return EntInterval.Week;
		// case "month":
		default:
			return EntInterval.Month;
	}
};

export const normalizeWindowCounter = ({
	now,
	windowEndsAt,
	count,
	windowConfig,
	from,
}: {
	now: number;
	windowEndsAt: number;
	count: number;
	windowConfig?: AutoTopupPurchaseLimit | AutoTopupWindowLimitConfig;
	from?: number;
}) => {
	if (!windowConfig) return undefined;

	if (now < windowEndsAt) {
		return { windowEndsAt, count };
	}

	const interval = intervalToEntInterval({ interval: windowConfig.interval });
	const intervalCount = windowConfig.interval_count ?? 1;

	let projected = from ?? now;
	do {
		projected = addInterval({ from: projected, interval, intervalCount });
	} while (projected <= now);

	return {
		windowEndsAt: projected,
		count: 0,
	};
};

export const addToLimitsUpdate = ({
	updates,
	state,
	windowEndsAtField,
	countField,
	windowEndsAt,
	count,
}: {
	updates: Partial<InsertAutoTopupLimitState>;
	state: Record<string, unknown>;
	windowEndsAtField:
		| "attempt_window_ends_at"
		| "failed_attempt_window_ends_at"
		| "purchase_window_ends_at";
	countField: "attempt_count" | "failed_attempt_count" | "purchase_count";
	windowEndsAt: number;
	count: number;
}) => {
	const currentWindowEndsAt = state[windowEndsAtField];
	const currentCount = state[countField];

	if (currentWindowEndsAt !== windowEndsAt) {
		updates[windowEndsAtField] = windowEndsAt;
	}

	if (currentCount !== count) {
		updates[countField] = count;
	}
};

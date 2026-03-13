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

const getWindowEndsAt = ({
	now,
	windowConfig,
}: {
	now: number;
	windowConfig: AutoTopupPurchaseLimit | AutoTopupWindowLimitConfig;
}) => {
	return addInterval({
		from: now,
		interval: intervalToEntInterval({ interval: windowConfig.interval }),
		intervalCount: windowConfig.interval_count ?? 1,
	});
};

export const normalizeWindowCounter = ({
	now,
	windowEndsAt,
	count,
	windowConfig,
}: {
	now: number;
	windowEndsAt: number;
	count: number;
	windowConfig?: AutoTopupPurchaseLimit | AutoTopupWindowLimitConfig;
}) => {
	if (!windowConfig) return undefined;

	if (now < windowEndsAt) {
		return { windowEndsAt, count };
	}

	return {
		windowEndsAt: getWindowEndsAt({ now, windowConfig }),
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

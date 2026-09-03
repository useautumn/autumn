import {
	type DbUsageAlert,
	type Feature,
	type FullSubject,
	getCurrentUsageWindowUsage,
	type UsageWindow,
	type UsageWindowLimit,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { usageWindowLimitToWebhookBlock } from "@/internal/balances/utils/usageWindows/usageWindowLimitToWebhookBlock.js";
import type {
	UsageAlertMeasurement,
	UsageAlertMeasurementPair,
} from "../types/usageAlertMeasurement.js";
import { findUsageWindowLimitForAlert } from "./findUsageWindowLimitForAlert.js";

const measureWindow = ({
	limit,
	usageWindows,
	now,
}: {
	limit: UsageWindowLimit;
	usageWindows: UsageWindow[];
	now: number;
}): UsageAlertMeasurement | null => {
	const usage = getCurrentUsageWindowUsage({ usageWindows, limit, now });
	const block = usageWindowLimitToWebhookBlock({ limit, usage });
	if (!block) return null;

	return {
		usage,
		denominator: limit.limit > 0 ? limit.limit : null,
		remaining: block.remaining,
		periodStartAt: limit.window_start_at,
		payloadBlock: { usage_limit: block },
	};
};

/**
 * Both sides read the same limit at the same `now`, so a window that rolled
 * between the two subjects measures 0 on the old side instead of yesterday's count.
 */
export const measureUsageLimitBasis = ({
	ctx,
	alert,
	feature,
	oldFullSubject,
	newFullSubject,
	now,
}: {
	ctx: AutumnContext;
	alert: DbUsageAlert;
	feature: Feature;
	oldFullSubject: FullSubject;
	newFullSubject: FullSubject;
	now: number;
}): UsageAlertMeasurementPair | null => {
	const limit = findUsageWindowLimitForAlert({
		ctx,
		alert,
		feature,
		fullSubject: newFullSubject,
		now,
	});
	if (!limit) return null;

	const before = measureWindow({
		limit,
		usageWindows: oldFullSubject.usage_windows ?? [],
		now,
	});
	const after = measureWindow({
		limit,
		usageWindows: newFullSubject.usage_windows ?? [],
		now,
	});
	return before && after ? { before, after } : null;
};

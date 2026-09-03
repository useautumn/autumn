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

const measureUsageWindow = ({
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
		payloadBlock: { basis: "usage_limit", usage_limit: block },
	};
};

// One limit at one now: a window that rolled between the subjects reads 0 on the old side.
export const measureUsageLimitBasis = ({
	ctx,
	alert,
	feature,
	oldFullSubject,
	newFullSubject,
}: {
	ctx: AutumnContext;
	alert: DbUsageAlert;
	feature: Feature;
	oldFullSubject: FullSubject;
	newFullSubject: FullSubject;
}): UsageAlertMeasurementPair | null => {
	const now = ctx.timestamp;
	const limit = findUsageWindowLimitForAlert({
		ctx,
		alert,
		feature,
		fullSubject: newFullSubject,
	});
	if (!limit) return null;

	const before = measureUsageWindow({
		limit,
		usageWindows: oldFullSubject.usage_windows ?? [],
		now,
	});
	const after = measureUsageWindow({
		limit,
		usageWindows: newFullSubject.usage_windows ?? [],
		now,
	});
	const measuredBothSides = before !== null && after !== null;
	return measuredBothSides ? { before, after } : null;
};

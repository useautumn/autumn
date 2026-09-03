import {
	getCurrentUsageWindowUsage,
	type UsageLimitWebhookBlock,
	type UsageWindow,
	type UsageWindowLimit,
} from "@autumn/shared";
import { usageWindowLimitToWebhookBlock } from "./usageWindowLimitToWebhookBlock.js";

export type UsageWindowLimitMeasurement = {
	usage: number;
	block: UsageLimitWebhookBlock;
};

export const measureUsageWindowLimit = ({
	limit,
	usageWindows,
	now,
}: {
	limit: UsageWindowLimit;
	usageWindows: UsageWindow[];
	now: number;
}): UsageWindowLimitMeasurement | null => {
	const usage = getCurrentUsageWindowUsage({ usageWindows, limit, now });
	const block = usageWindowLimitToWebhookBlock({ limit, usage });
	return block ? { usage, block } : null;
};

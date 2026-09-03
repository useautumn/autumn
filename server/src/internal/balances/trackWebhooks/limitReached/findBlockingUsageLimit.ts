import {
	type Feature,
	type FullSubject,
	getCurrentUsageWindowUsage,
	usageLimitFilterMatchesProperties,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resolveUsageWindowLimits } from "@/internal/balances/utils/usageWindows/resolveUsageWindowLimits.js";
import { usageWindowLimitToWebhookBlock } from "@/internal/balances/utils/usageWindows/usageWindowLimitToWebhookBlock.js";
import type { BlockingUsageLimit } from "./types/blockingUsageLimit.js";

/**
 * The cap that blocked this event. Enforcement stops at the cap with the least
 * headroom, so the webhook reports that one, filter included, from one source.
 */
export const findBlockingUsageLimit = ({
	ctx,
	fullSubject,
	feature,
	eventProperties,
	now,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	feature: Feature;
	eventProperties?: Record<string, unknown> | null;
	now: number;
}): BlockingUsageLimit | undefined => {
	const usageWindows = fullSubject.usage_windows ?? [];
	const measured = resolveUsageWindowLimits({ ctx, fullSubject, feature, now })
		.filter((limit) =>
			usageLimitFilterMatchesProperties({
				filterProperties: limit.filter_properties,
				eventProperties,
			}),
		)
		.map((limit) => ({
			limit,
			headroom:
				limit.limit - getCurrentUsageWindowUsage({ usageWindows, limit, now }),
		}))
		.sort((left, right) => left.headroom - right.headroom);

	const tightest = measured[0];
	if (!tightest || tightest.headroom > 0) return undefined;

	const block = usageWindowLimitToWebhookBlock({
		limit: tightest.limit,
		usage: tightest.limit.limit - tightest.headroom,
	});
	if (!block) return undefined;

	return {
		block,
		filter: tightest.limit.filter_properties
			? { properties: tightest.limit.filter_properties }
			: undefined,
	};
};

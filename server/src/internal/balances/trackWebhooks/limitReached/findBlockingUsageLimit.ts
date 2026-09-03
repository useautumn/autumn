import {
	type Feature,
	type FullSubject,
	subtractSafe,
	usageLimitFilterMatchesProperties,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { measureUsageWindowLimit } from "@/internal/balances/utils/usageWindows/measureUsageWindowLimit.js";
import { resolveUsageWindowLimits } from "@/internal/balances/utils/usageWindows/resolveUsageWindowLimits.js";
import type { BlockingUsageLimit } from "./types/blockingUsageLimit.js";

// Enforcement stops at the cap with the least headroom; report that one, filter included.
export const findBlockingUsageLimit = ({
	ctx,
	fullSubject,
	feature,
	eventProperties,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	feature: Feature;
	eventProperties?: Record<string, unknown> | null;
}): BlockingUsageLimit | undefined => {
	const now = ctx.timestamp;
	const usageWindows = fullSubject.usage_windows ?? [];
	const measured = resolveUsageWindowLimits({
		ctx,
		fullSubject,
		featureIds: [feature.id],
	})
		.filter((limit) =>
			usageLimitFilterMatchesProperties({
				filterProperties: limit.filter_properties,
				eventProperties,
			}),
		)
		.flatMap((limit) => {
			const measurement = measureUsageWindowLimit({ limit, usageWindows, now });
			if (!measurement) return [];
			const headroom = subtractSafe({
				left: limit.limit,
				right: measurement.usage,
			});
			return [{ limit, block: measurement.block, headroom }];
		})
		.sort((left, right) => left.headroom - right.headroom);

	const tightest = measured[0];
	if (!tightest || tightest.headroom > 0) return undefined;

	return {
		block: tightest.block,
		filter: tightest.limit.filter_properties
			? { properties: tightest.limit.filter_properties }
			: undefined,
	};
};

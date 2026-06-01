import type {
	UsageWindowDimension,
	UsageWindowScope,
} from "../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { EntInterval } from "../../models/productModels/intervals/entitlementInterval.js";

const NULL_SEGMENT = "_";

/**
 * Deterministic key for one usage-window counter. The Lua deduction script must
 * reproduce this exact format and segment order, or a counter silently splits
 * in two. Keyed by internal entity id so a changed/null public id can't shift it.
 */
export const buildUsageWindowKey = ({
	scopeType,
	internalEntityId,
	dimensionType,
	dimensionFeatureId,
	interval,
	windowStartAt,
}: {
	scopeType: UsageWindowScope;
	internalEntityId: string | null;
	dimensionType: UsageWindowDimension;
	dimensionFeatureId: string | null;
	interval: EntInterval;
	windowStartAt: number;
}): string =>
	[
		scopeType,
		internalEntityId ?? NULL_SEGMENT,
		dimensionType,
		dimensionFeatureId ?? NULL_SEGMENT,
		interval,
		windowStartAt,
	].join(":");

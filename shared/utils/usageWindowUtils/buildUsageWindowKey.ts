import type {
	UsageWindowDimension,
	UsageWindowScope,
} from "../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { EntInterval } from "../../models/productModels/intervals/entitlementInterval.js";

const NULL_SEGMENT = "_";
const DELIMITER = ":";

/**
 * Deterministic key for one usage-window counter. Lua looks the counter up by
 * this exact string (`limit.key`), so the format must stay stable. Fail-closed if
 * an externally-influenced segment is the literal NULL_SEGMENT or contains the
 * DELIMITER, either of which would alias two distinct windows onto one counter.
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
}): string => {
	for (const segment of [internalEntityId, dimensionFeatureId]) {
		if (
			segment !== null &&
			(segment === NULL_SEGMENT || segment.includes(DELIMITER))
		) {
			throw new Error(
				`buildUsageWindowKey: segment "${segment}" collides with the key encoding (reserved "${NULL_SEGMENT}" / "${DELIMITER}")`,
			);
		}
	}

	return [
		scopeType,
		internalEntityId ?? NULL_SEGMENT,
		dimensionType,
		dimensionFeatureId ?? NULL_SEGMENT,
		interval,
		windowStartAt,
	].join(DELIMITER);
};

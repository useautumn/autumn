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
	filterKey,
}: {
	scopeType: UsageWindowScope;
	internalEntityId: string | null;
	dimensionType: UsageWindowDimension;
	dimensionFeatureId: string | null;
	interval: EntInterval;
	windowStartAt: number;
	filterKey?: string | null;
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

	const segments: Array<string | number> = [
		scopeType,
		internalEntityId ?? NULL_SEGMENT,
		dimensionType,
		dimensionFeatureId ?? NULL_SEGMENT,
		interval,
		windowStartAt,
	];
	// Appended only for filtered windows so pre-filter keys stay byte-identical
	// (live unfiltered counters keep their identity). Filter values are
	// user-controlled: URI-encode to keep the delimiter unambiguous.
	if (filterKey) {
		segments.push(`f=${encodeURIComponent(filterKey)}`);
	}
	return segments.join(DELIMITER);
};

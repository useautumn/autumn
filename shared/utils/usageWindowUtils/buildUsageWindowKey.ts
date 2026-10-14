import type {
	UsageWindowDimension,
	UsageWindowScope,
} from "../../models/cusProductModels/cusEntModels/usageWindowModels.js";
import type { EntInterval } from "../../models/productModels/intervals/entitlementInterval.js";

const NULL_SEGMENT = "_";
const DELIMITER = ":";

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
	if (filterKey) {
		segments.push(`f=${encodeURIComponent(filterKey)}`);
	}
	return segments.join(DELIMITER);
};

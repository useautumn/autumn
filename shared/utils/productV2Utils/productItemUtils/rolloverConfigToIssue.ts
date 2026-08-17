import type { RolloverConfig } from "../../../models/productV2Models/productItemModels/productItemModels.js";

/** First validation issue with a rollover config's max settings, or null if valid. */
export const rolloverConfigToIssue = ({
	rollover,
}: {
	rollover?: RolloverConfig | null;
}): string | null => {
	if (rollover === null || rollover === undefined) return null;

	if (rollover.max != null && rollover.max_percentage != null) {
		return "Rollover max and max_percentage are mutually exclusive. Set one or the other, not both.";
	}

	if (rollover.max_percentage != null) {
		if (rollover.max_percentage <= 0 || rollover.max_percentage > 100) {
			return "Rollover max_percentage must be between 0 (exclusive) and 100 (inclusive)";
		}
		return null;
	}

	if (rollover.max != null && rollover.max <= 0) {
		return "Rollover maximum amount must be greater than 0";
	}

	return null;
};

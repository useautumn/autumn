import type { FreeTrialDuration } from "../../../../models/productModels/freeTrialModels/freeTrialEnums.js";
import { addDuration } from "../../../../utils/billingUtils/intervalUtils/addDuration.js";
import type { DurationMatcher } from "../durationMatcher.js";

type MeasuredDuration = { length: number; unit: "day" | "month" | "year" };

const endOf = ({
	duration,
	startsAt,
}: {
	duration: MeasuredDuration;
	startsAt: number;
}) =>
	addDuration({
		now: startsAt,
		durationType: duration.unit as FreeTrialDuration,
		durationLength: duration.length,
	});

/**
 * Evaluate a `DurationMatcher` by comparing end dates from the same start, so
 * "1 month" always equals "1 month" and 31 days is longer than February.
 * A missing duration never matches; "has no trial" is `null` one level up.
 */
export const durationMatcherMatches = ({
	matcher,
	duration,
	startsAt,
}: {
	matcher: DurationMatcher | undefined;
	duration: MeasuredDuration | null;
	startsAt: number;
}): boolean => {
	if (matcher === undefined) return true;
	if (duration === null) return false;

	const end = endOf({ duration, startsAt });
	const boundEnd = (bound: MeasuredDuration) =>
		endOf({ duration: bound, startsAt });

	if (matcher.$eq && end !== boundEnd(matcher.$eq)) return false;
	if (matcher.$lt && !(end < boundEnd(matcher.$lt))) return false;
	if (matcher.$lte && !(end <= boundEnd(matcher.$lte))) return false;
	if (matcher.$gt && !(end > boundEnd(matcher.$gt))) return false;
	if (matcher.$gte && !(end >= boundEnd(matcher.$gte))) return false;
	return true;
};

import type { DurationMatcher } from "../../../../common/filters/durationMatcher";
import { durationMatcherMatches } from "../../../../common/filters/match/durationMatcherMatches";
import type { FreeTrialFacts } from "../../facts/billingFacts";
import { describeDuration } from "../format/describeDuration";
import { describeDurationMatcher } from "../format/describeDurationMatcher";
import { leafField } from "./leafField";

/**
 * A trial's length against a `DurationMatcher`, both measured on the calendar
 * from the trial's start. Never Stripe's `trial_end`, which carries a buffer.
 */
export const durationField = ({ label }: { label: string }) =>
	leafField<FreeTrialFacts>({
		label,
		matches: ({ filter, parent }) =>
			durationMatcherMatches({
				matcher: filter as DurationMatcher,
				duration: parent.duration,
				startsAt: parent.starts_at,
			}),
		describeCondition: ({ filter }) =>
			describeDurationMatcher({ matcher: filter as DurationMatcher }),
		describeActual: ({ parent }) =>
			describeDuration({ duration: parent.duration }),
	});

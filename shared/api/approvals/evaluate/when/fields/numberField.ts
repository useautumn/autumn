import { numberMatcherMatches } from "../../../../common/filters/match/numberMatcherMatches";
import type { NumberMatcher } from "../../../../common/filters/matcher";
import { describeNumberMatcher } from "../format/describeNumberMatcher";
import { leafField } from "./leafField";

/** `format` adds a unit to limits and actuals, e.g. `(n) => \`${n}%\``. */
export const numberField = <Parent>({
	label,
	read,
	format = String,
}: {
	label: string;
	read: (parent: Parent) => number | null;
	format?: (value: number) => string;
}) =>
	leafField<Parent>({
		label,
		matches: ({ filter, parent }) =>
			numberMatcherMatches({
				matcher: filter as NumberMatcher,
				value: read(parent),
			}),
		describeLimit: ({ filter }) =>
			describeNumberMatcher({ matcher: filter as NumberMatcher, format }),
		describeActual: ({ parent }) => {
			const value = read(parent);
			return value === null ? "none" : format(value);
		},
	});

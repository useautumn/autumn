import { stringMatcherMatches } from "../../../../common/filters/match/stringMatcherMatches";
import type { StringMatcher } from "../../../../common/filters/matcher";
import { describeStringMatcher } from "../format/describeStringMatcher";
import { leafField } from "./leafField";

/** Ids and enums. */
export const stringField = <Parent>({
	label,
	read,
}: {
	label: string;
	read: (parent: Parent) => string | null;
}) =>
	leafField<Parent>({
		label,
		matches: ({ filter, parent }) =>
			stringMatcherMatches({
				matcher: filter as StringMatcher,
				value: read(parent),
			}),
		describeCondition: ({ filter }) =>
			describeStringMatcher({ matcher: filter as StringMatcher }),
		describeActual: ({ parent }) => read(parent) ?? "none",
	});

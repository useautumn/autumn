import { addDays, differenceInCalendarDays, isAfter, isBefore } from "date-fns";
import type { RelativeDateMatcher } from "../../../schemas/filters/filterFields";
import { describeDaysFromNow } from "../format/describeDaysFromNow";
import { leafField } from "./leafField";

type RelativeDateOperator = "$gt" | "$gte" | "$lt" | "$lte";

const OPERATOR_SYMBOLS: Record<RelativeDateOperator, string> = {
	$gt: ">",
	$gte: "≥",
	$lt: "<",
	$lte: "≤",
};

const dateSatisfies = ({
	operator,
	date,
	bound,
}: {
	operator: RelativeDateOperator;
	date: number;
	bound: Date;
}) => {
	if (operator === "$gt") return isAfter(date, bound);
	if (operator === "$gte") return !isBefore(date, bound);
	if (operator === "$lt") return isBefore(date, bound);
	return !isAfter(date, bound);
};

const listBounds = ({
	matcher,
}: {
	matcher: NonNullable<RelativeDateMatcher>;
}) =>
	(Object.keys(OPERATOR_SYMBOLS) as RelativeDateOperator[]).flatMap(
		(operator) => {
			const bound = matcher[operator];
			return bound ? [{ operator, days: bound.days_from_now }] : [];
		},
	);

/** Dates are unix ms; rule bounds are `{ days_from_now }`, resolved against `context.now`. */
export const relativeDateField = <Parent>({
	label,
	read,
}: {
	label: string;
	read: (parent: Parent) => number | null;
}) =>
	leafField<Parent>({
		label,
		matches: ({ filter, parent, context }) => {
			const matcher = filter as RelativeDateMatcher;
			const date = read(parent);
			if (matcher === null) return date === null;
			if (date === null) return false;
			return listBounds({ matcher }).every(({ operator, days }) =>
				dateSatisfies({ operator, date, bound: addDays(context.now, days) }),
			);
		},
		describeCondition: ({ filter }) => {
			const matcher = filter as RelativeDateMatcher;
			if (matcher === null) return "none";
			const bounds = listBounds({ matcher }).map(
				({ operator, days }) =>
					`${OPERATOR_SYMBOLS[operator]} ${describeDaysFromNow({ days })}`,
			);
			return bounds.join(" and ") || "any date";
		},
		describeActual: ({ parent, context }) => {
			const date = read(parent);
			if (date === null) return "none";
			return describeDaysFromNow({
				days: differenceInCalendarDays(date, context.now),
			});
		},
	});

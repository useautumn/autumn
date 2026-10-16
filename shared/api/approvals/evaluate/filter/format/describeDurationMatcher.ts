import type { DurationMatcher } from "../../../../common/filters/durationMatcher";
import { describeDuration } from "./describeDuration";

const OPERATOR_SYMBOLS = {
	$gt: ">",
	$gte: "≥",
	$lt: "<",
	$lte: "≤",
} as const;

/** `{ $lt: { length: 2, unit: "month" } }` → "< 2 months". */
export const describeDurationMatcher = ({
	matcher,
}: {
	matcher: DurationMatcher;
}): string => {
	const parts = [
		matcher.$eq && describeDuration({ duration: matcher.$eq }),
		...Object.entries(OPERATOR_SYMBOLS).map(([operator, symbol]) => {
			const bound = matcher[operator as keyof typeof OPERATOR_SYMBOLS];
			return bound && `${symbol} ${describeDuration({ duration: bound })}`;
		}),
	];
	return parts.filter((part): part is string => Boolean(part)).join(" and ");
};

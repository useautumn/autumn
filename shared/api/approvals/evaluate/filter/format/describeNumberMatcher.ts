import type { NumberMatcher } from "../../../../common/filters/matcher";

const OPERATOR_SYMBOLS = {
	$gt: ">",
	$gte: "≥",
	$lt: "<",
	$lte: "≤",
} as const;

/** `{ $lte: 20 }` → "≤ 20"; `format` adds the unit ("≤ 20%", "< 2 months"). */
export const describeNumberMatcher = ({
	matcher,
	format = String,
}: {
	matcher: NumberMatcher;
	format?: (value: number) => string;
}): string => {
	if (matcher === null) return "none";
	if (typeof matcher === "number") return format(matcher);

	const parts = [
		matcher.$eq === null ? "none" : undefined,
		typeof matcher.$eq === "number" ? format(matcher.$eq) : undefined,
		matcher.$ne === null ? "any" : undefined,
		typeof matcher.$ne === "number" ? `≠ ${format(matcher.$ne)}` : undefined,
		matcher.$in ? matcher.$in.map(format).join(" or ") : undefined,
		matcher.$nin ? `not ${matcher.$nin.map(format).join(", ")}` : undefined,
		...Object.entries(OPERATOR_SYMBOLS).map(([operator, symbol]) => {
			const bound = matcher[operator as keyof typeof OPERATOR_SYMBOLS];
			return bound === undefined ? undefined : `${symbol} ${format(bound)}`;
		}),
	];
	return (
		parts.filter((part): part is string => Boolean(part)).join(" and ") ||
		"any amount"
	);
};

import type { StringMatcher } from "../../../../common/filters/matcher";

/** `"pro"` → "pro"; `{ $in: ["a", "b"] }` → "a or b"; `{ $ne: "a" }` → "not a". */
export const describeStringMatcher = ({
	matcher,
}: {
	matcher: StringMatcher;
}): string => {
	if (matcher === null) return "none";
	if (typeof matcher === "string") return matcher;

	const parts = [
		matcher.$eq === null ? "none" : matcher.$eq,
		matcher.$ne === null ? "any" : matcher.$ne && `not ${matcher.$ne}`,
		matcher.$in?.join(" or "),
		matcher.$nin && `not ${matcher.$nin.join(", ")}`,
		matcher.$regex && `matches ${matcher.$regex}`,
		matcher.$startsWith && `starts with ${matcher.$startsWith}`,
	];
	return parts.filter((part): part is string => Boolean(part)).join(" and ");
};

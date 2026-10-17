import type { StringMatcher } from "../../../../common/filters/matcher";

/** An empty id reads as `""`, so a condition is never blank. */
const describeValue = ({ value }: { value: string }) => value || '""';

/** `"pro"` → "pro"; `{ $in: ["a", "b"] }` → "a or b"; `{ $ne: "a" }` → "not a". */
export const describeStringMatcher = ({
	matcher,
}: {
	matcher: StringMatcher;
}): string => {
	if (matcher === null) return "none";
	if (typeof matcher === "string") return describeValue({ value: matcher });

	const parts = [
		matcher.$eq === null
			? "none"
			: matcher.$eq !== undefined && describeValue({ value: matcher.$eq }),
		matcher.$ne === null
			? "any"
			: matcher.$ne !== undefined &&
				`not ${describeValue({ value: matcher.$ne })}`,
		matcher.$in?.map((value) => describeValue({ value })).join(" or "),
		matcher.$nin &&
			`not ${matcher.$nin.map((value) => describeValue({ value })).join(", ")}`,
		matcher.$regex !== undefined && `matches ${matcher.$regex}`,
		matcher.$startsWith !== undefined && `starts with ${matcher.$startsWith}`,
	];
	return parts.filter((part): part is string => Boolean(part)).join(" and ");
};

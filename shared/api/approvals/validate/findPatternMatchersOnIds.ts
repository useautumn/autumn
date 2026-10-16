import type { ApprovalRuleIssue, FilterEntry } from "./types";

const ID_FIELD_LABELS: Record<string, string> = {
	customer_id: "Customer",
	plan_id: "Plan",
	feature_id: "Feature",
	reward_id: "Reward",
};

const PATTERN_OPERATOR_LABELS: Record<string, string> = {
	$regex: "matches",
	$startsWith: "starts with",
};

const patternOperatorOf = ({ value }: { value: unknown }) =>
	typeof value === "object" && value !== null
		? Object.keys(value).find((key) => key in PATTERN_OPERATOR_LABELS)
		: undefined;

/** Ids are rewritten when a plan or feature is renamed; a pattern can't be. */
export const findPatternMatchersOnIds = ({
	entries,
}: {
	entries: FilterEntry[];
}): ApprovalRuleIssue[] =>
	entries.flatMap((entry) => {
		const fieldLabel = ID_FIELD_LABELS[entry.key];
		const operator = patternOperatorOf({ value: entry.value });
		if (!fieldLabel || !operator) return [];

		return [
			{
				path: entry.path.join("."),
				message: `${fieldLabel} conditions can't use "${PATTERN_OPERATOR_LABELS[operator]}".`,
			},
		];
	});

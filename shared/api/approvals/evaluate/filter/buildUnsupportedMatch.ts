import type { FilterMatch } from "./filterFieldTypes";

const UNSUPPORTED_LABEL = "Unsupported condition";

/**
 * A condition the evaluator can't check. It keeps the field's label when the
 * field is known (its matcher can't check the value), and otherwise says what it is.
 */
export const buildUnsupportedMatch = ({
	field,
	label,
}: {
	field: string;
	label?: string;
}): FilterMatch => ({
	result: "unsupported",
	conditions: [
		{
			field: field || "filter",
			label: label || UNSUPPORTED_LABEL,
			limit: "Can't be checked",
			actual: "Unknown",
		},
	],
});

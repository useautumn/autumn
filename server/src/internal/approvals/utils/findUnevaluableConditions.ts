import {
	ACTIONS,
	type ApprovalAction,
	type ApprovalRuleFilter,
	type ApprovalRuleIssue,
} from "@autumn/shared";
import {
	FILTER_FIELDS_BY_KEY,
	type FilterFields,
} from "@autumn/shared/api/approvals/evaluate/index.js";

const QUANTIFIERS = ["$some", "$every", "$none"];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isNullCheck = (value: unknown) =>
	value === null ||
	(isPlainObject(value) && (value.$eq === null || value.$ne === null));

const issueAt = ({ path, message }: { path: string[]; message: string }) => ({
	path: path.join("."),
	message,
});

/**
 * The dry evaluation run on save: walks the filter through the evaluator's own field registry
 * and reports every key or group it would treat as unsupported, so no saved rule fails per request.
 */
export const findUnevaluableConditions = ({
	actions,
	filter,
}: {
	actions: ApprovalAction[];
	filter: ApprovalRuleFilter | null;
}): ApprovalRuleIssue[] => {
	const filterKey = ACTIONS[actions[0]]?.filter;
	if (filter === null || !filterKey) return [];
	return walkFilter({
		filter,
		fields: FILTER_FIELDS_BY_KEY[filterKey] as FilterFields<unknown>,
		path: ["filter"],
	});
};

const walkFilter = ({
	filter,
	fields,
	path,
}: {
	filter: unknown;
	fields: FilterFields<unknown>;
	path: string[];
}): ApprovalRuleIssue[] => {
	if (!isPlainObject(filter))
		return [issueAt({ path, message: "A condition must be an object." })];

	return Object.entries(filter).flatMap(([key, value]) => {
		const keyPath = [...path, key];
		if (value === undefined) return [];

		if (key === "$and" || key === "$or") {
			if (!Array.isArray(value) || value.length === 0)
				return [
					issueAt({
						path: keyPath,
						message: `"${key}" needs at least one condition.`,
					}),
				];
			return value.flatMap((branch, index) =>
				walkFilter({
					filter: branch,
					fields,
					path: [...keyPath, String(index)],
				}),
			);
		}

		const field = fields[key];
		if (!field)
			return [
				issueAt({
					path: keyPath,
					message: `"${key}" isn't a condition approvals can check for these actions.`,
				}),
			];
		if (!field.fields || isNullCheck(value)) return [];

		const nested = field.fields as FilterFields<unknown>;
		const quantifiers = isPlainObject(value)
			? QUANTIFIERS.filter((quantifier) => quantifier in value)
			: [];
		if (quantifiers.length === 0)
			return walkFilter({ filter: value, fields: nested, path: keyPath });
		return quantifiers.flatMap((quantifier) =>
			walkFilter({
				filter: (value as Record<string, unknown>)[quantifier],
				fields: nested,
				path: [...keyPath, quantifier],
			}),
		);
	});
};

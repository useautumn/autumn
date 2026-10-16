import type { z } from "zod/v4";
import {
	ACTIONS,
	APPROVAL_AREAS,
	type ApprovalAction,
} from "../actions/approvalActions";
import { actionsToFilterSchema } from "../schemas/actionsToFilterSchema";
import type { ApprovalRuleFilter } from "../schemas/filters/approvalFilterShapes";
import { ARRAY_QUANTIFIERS } from "../schemas/filters/filterFields";
import { findStrippedKeys } from "../schemas/findStrippedKeys";
import { joinWithAnd } from "../utils/joinWithAnd";
import type { ApprovalRuleIssue } from "./types";

const filterIssueMessage = ({ issue }: { issue: z.core.$ZodIssue }) =>
	issue.code === "invalid_union"
		? "This value or operator doesn't fit the field."
		: issue.message;

const strippedKeyMessage = ({ key }: { key: string }) =>
	ARRAY_QUANTIFIERS.includes(key)
		? `A condition inside "${key}" doesn't fit its field. Check each operator and value.`
		: `"${key}" isn't a valid condition here. Check the field, operator and value.`;

type CheckResult = {
	filter: ApprovalRuleFilter | null;
	issues: ApprovalRuleIssue[];
};

/**
 * Rule-level checks the field schemas can't express: one area, and the filter
 * fits the actions. Parses the raw filter, so nothing the envelope kept slips by.
 */
export const checkRuleActionsAndFilter = ({
	actions,
	filter,
}: {
	actions: ApprovalAction[];
	filter: unknown;
}): CheckResult => {
	const areas = [...new Set(actions.map((action) => ACTIONS[action].area))];
	if (areas.length > 1) {
		const areaLabels = joinWithAnd({
			items: areas.map((area) => APPROVAL_AREAS[area]),
		});
		return {
			filter: null,
			issues: [
				{
					path: "actions",
					message: `All actions in a rule must be from one area (got ${areaLabels}).`,
				},
			],
		};
	}

	if (filter === null || filter === undefined)
		return { filter: null, issues: [] };

	const filterSchema = actionsToFilterSchema({ actions });
	if (!filterSchema) {
		const actionLabels = joinWithAnd({
			items: actions.map((action) => ACTIONS[action].label),
		});
		return {
			filter: null,
			issues: [
				{
					path: "filter",
					message: `Rules on ${actionLabels} can't have conditions.`,
				},
			],
		};
	}

	const result = filterSchema.safeParse(filter);
	if (!result.success) {
		return {
			filter: null,
			issues: result.error.issues.map((issue) => ({
				path: ["filter", ...issue.path].join("."),
				message: filterIssueMessage({ issue }),
			})),
		};
	}

	const issues = findStrippedKeys({ input: filter, output: result.data }).map(
		(path) => ({
			path: ["filter", ...path].join("."),
			message: strippedKeyMessage({ key: String(path[path.length - 1]) }),
		}),
	);
	return { filter: result.data as ApprovalRuleFilter, issues };
};

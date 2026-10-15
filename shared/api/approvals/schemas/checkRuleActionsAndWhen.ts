import type { z } from "zod/v4";
import {
	ACTIONS,
	APPROVAL_AREAS,
	type ApprovalAction,
} from "../actions/approvalActions";
import { actionsToWhenSchema } from "./actionsToWhenSchema";
import { findStrippedKeys } from "./findStrippedKeys";
import { ARRAY_QUANTIFIERS } from "./when/whenFields";

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });

const whenIssueMessage = ({ issue }: { issue: z.core.$ZodIssue }) =>
	issue.code === "invalid_union"
		? "This value or operator doesn't fit the field."
		: issue.message;

const strippedKeyMessage = ({ key }: { key: string }) =>
	ARRAY_QUANTIFIERS.includes(key)
		? `A condition inside "${key}" doesn't fit its field. Check each operator and value.`
		: `"${key}" isn't a valid condition here. Check the field, operator and value.`;

/** Rule-level checks the field schemas can't express: one area, and `when` fits the actions. */
export const checkRuleActionsAndWhen = (
	rule: { actions: ApprovalAction[]; when?: unknown },
	ctx: z.RefinementCtx,
) => {
	const areas = [
		...new Set(rule.actions.map((action) => ACTIONS[action].area)),
	];
	if (areas.length > 1) {
		const areaLabels = listFormat.format(
			areas.map((area) => APPROVAL_AREAS[area]),
		);
		ctx.addIssue({
			code: "custom",
			path: ["actions"],
			message: `All actions in a rule must be from one area (got ${areaLabels}).`,
		});
		return;
	}

	if (rule.when === null || rule.when === undefined) return;

	const whenSchema = actionsToWhenSchema({ actions: rule.actions });
	if (!whenSchema) {
		const actionLabels = listFormat.format(
			rule.actions.map((action) => ACTIONS[action].label),
		);
		ctx.addIssue({
			code: "custom",
			path: ["when"],
			message: `Rules on ${actionLabels} can't have conditions.`,
		});
		return;
	}

	const result = whenSchema.safeParse(rule.when);
	if (!result.success) {
		for (const issue of result.error.issues) {
			ctx.addIssue({
				code: "custom",
				path: ["when", ...issue.path],
				message: whenIssueMessage({ issue }),
			});
		}
		return;
	}

	for (const path of findStrippedKeys({
		input: rule.when,
		output: result.data,
	})) {
		ctx.addIssue({
			code: "custom",
			path: ["when", ...path],
			message: strippedKeyMessage({ key: String(path.at(-1)) }),
		});
	}
};

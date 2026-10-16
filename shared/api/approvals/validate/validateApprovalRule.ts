import {
	type ApprovalRuleParams,
	CreateApprovalRuleParamsSchema,
} from "../schemas/approvalRule";
import { isPlainObject } from "../schemas/isPlainObject";
import { checkFeatureChosen } from "./checkFeatureChosen";
import { checkRuleActionsAndFilter } from "./checkRuleActionsAndFilter";
import { findBareArrayFilters } from "./findBareArrayFilters";
import { findCustomOnIncomingPlans } from "./findCustomOnIncomingPlans";
import { findDuplicateSubjectsAndActions } from "./findDuplicateSubjectsAndActions";
import { findEmptyGroups } from "./findEmptyGroups";
import { findEveryInBlockRules } from "./findEveryInBlockRules";
import { findPatternMatchersOnIds } from "./findPatternMatchersOnIds";
import { findUnruledActions } from "./findUnruledActions";
import { listFilterEntries } from "./listFilterEntries";
import type { ApprovalRuleIssue } from "./types";

export type ValidateApprovalRuleResult =
	| { ok: true; rule: ApprovalRuleParams }
	| { ok: false; issues: ApprovalRuleIssue[] };

/**
 * Validates a rule before it's saved: its shape, then that its filter fits its
 * area, then the limits rules add on top of migration filters. Structural only.
 */
export const validateApprovalRule = ({
	rule,
}: {
	rule: unknown;
}): ValidateApprovalRuleResult => {
	const parsed = CreateApprovalRuleParamsSchema.safeParse(rule);
	if (!parsed.success) {
		return {
			ok: false,
			issues: parsed.error.issues.map((issue) => ({
				path: issue.path.join("."),
				message: issue.message,
			})),
		};
	}

	const { actions, effect, subjects } = parsed.data;
	const rawFilter = isPlainObject(rule) ? rule.filter : undefined;
	const area = checkRuleActionsAndFilter({ actions, filter: rawFilter });
	const entries = listFilterEntries({ value: rawFilter });
	const issues = [
		...area.issues,
		...findDuplicateSubjectsAndActions({ subjects, actions }),
		...findPatternMatchersOnIds({ entries }),
		...findBareArrayFilters({ entries }),
		...findEveryInBlockRules({ effect, entries }),
		...findEmptyGroups({ entries }),
		...findCustomOnIncomingPlans({ entries }),
		...checkFeatureChosen({ actions, filter: rawFilter }),
		...findUnruledActions({ actions }),
	];

	return issues.length > 0
		? { ok: false, issues }
		: { ok: true, rule: { ...parsed.data, filter: area.filter } };
};

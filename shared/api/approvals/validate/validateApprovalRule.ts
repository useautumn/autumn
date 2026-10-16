import {
	type ApprovalRuleParams,
	CreateApprovalRuleParamsSchema,
} from "../schemas/approvalRule";
import { checkFeatureChosen } from "./checkFeatureChosen";
import { findBareArrayFilters } from "./findBareArrayFilters";
import { findCustomOnIncomingPlans } from "./findCustomOnIncomingPlans";
import { findEmptyGroups } from "./findEmptyGroups";
import { findPatternMatchersOnIds } from "./findPatternMatchersOnIds";
import { listWhenEntries } from "./listWhenEntries";
import type { ApprovalRuleIssue } from "./types";

export type ValidateApprovalRuleResult =
	| { ok: true; rule: ApprovalRuleParams }
	| { ok: false; issues: ApprovalRuleIssue[] };

/**
 * Validates a rule before it's saved: its shape, then the structural limits
 * rules add on top of migration filters. Checks are structural only.
 */
export const validateApprovalRule = (
	rule: unknown,
): ValidateApprovalRuleResult => {
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

	const { actions, when } = parsed.data;
	const entries = listWhenEntries({ value: when });
	const issues = [
		...findPatternMatchersOnIds({ entries }),
		...findBareArrayFilters({ entries }),
		...findEmptyGroups({ entries }),
		...findCustomOnIncomingPlans({ entries }),
		...checkFeatureChosen({ actions, when }),
	];

	return issues.length > 0
		? { ok: false, issues }
		: { ok: true, rule: parsed.data };
};

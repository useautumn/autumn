import type {
	ApprovalRule,
	UpdateApprovalRuleParams,
} from "../schemas/approvalRule";
import {
	type ValidateApprovalRuleResult,
	validateApprovalRule,
} from "./validateApprovalRule";

/**
 * Validates an update as the whole rule it produces, so changing `actions`
 * re-checks the stored filter against the new area.
 */
export const validateApprovalRuleUpdate = ({
	current,
	patch,
}: {
	current: ApprovalRule;
	patch: UpdateApprovalRuleParams;
}): ValidateApprovalRuleResult => {
	const { id: _id, ...changes } = patch;
	const definedChanges = Object.fromEntries(
		Object.entries(changes).filter(([, value]) => value !== undefined),
	);
	return validateApprovalRule({
		rule: {
			name: current.name,
			effect: current.effect,
			subjects: current.subjects,
			actions: current.actions,
			filter: current.filter,
			note: current.note,
			enabled: current.enabled,
			...definedChanges,
		},
	});
};

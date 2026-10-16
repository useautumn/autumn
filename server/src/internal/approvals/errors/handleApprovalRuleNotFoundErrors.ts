import { RecaseError } from "@autumn/shared";

export const handleApprovalRuleNotFoundErrors = <Rule>({
	ruleId,
	rule,
}: {
	ruleId: string;
	rule: Rule | undefined;
}): Rule => {
	if (rule) return rule;

	throw new RecaseError({
		message: `Approval rule ${ruleId} not found`,
		code: "approval_rule_not_found",
		statusCode: 404,
	});
};

import {
	type ApprovalRuleIssue,
	approvalRuleIssuesToError,
} from "@autumn/shared";

export const handleInvalidApprovalRuleErrors = ({
	issues,
}: {
	issues: ApprovalRuleIssue[];
}) => {
	if (issues.length > 0) throw approvalRuleIssuesToError({ issues });
};

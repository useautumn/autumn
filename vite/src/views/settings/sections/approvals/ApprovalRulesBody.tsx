import type { ApprovalRule } from "@autumn/shared";
import { getBackendErr } from "@/utils/genUtils";
import { ApprovalRulesEmpty } from "./ApprovalRulesEmpty";
import { ApprovalRulesTable } from "./ApprovalRulesTable";
import type { RuleRowActions } from "./RuleRowMenu";

/** The table, or why there isn't one: a failed load or no rules yet. */
export const ApprovalRulesBody = ({
	rules,
	error,
	rowActions,
}: {
	rules: ApprovalRule[];
	error: unknown;
	rowActions: RuleRowActions | null;
}) => {
	if (error) {
		return (
			<ApprovalRulesEmpty
				title="Couldn't load rules"
				description={getBackendErr(error, "Refresh the page to try again.")}
			/>
		);
	}
	if (rules.length === 0) {
		return (
			<ApprovalRulesEmpty
				title="No rules yet"
				description="Without rules, each role keeps its usual access."
			/>
		);
	}
	return <ApprovalRulesTable rules={rules} rowActions={rowActions} />;
};

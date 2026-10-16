import type { ApprovalAction } from "../actions/approvalActions";
import type { ApprovalRuleIssue } from "./types";

/** Who-only rules can't limit which role a member grants, so member actions stay on organisation:write for now. */
const UNRULED_ACTIONS: ApprovalAction[] = [
	"members.invite",
	"members.change_role",
];

export const findUnruledActions = ({
	actions,
}: {
	actions: ApprovalAction[];
}): ApprovalRuleIssue[] =>
	actions.some((action) => UNRULED_ACTIONS.includes(action))
		? [
				{
					path: "actions",
					message:
						"Member actions aren't rule-controlled yet; they use organisation:write.",
				},
			]
		: [];

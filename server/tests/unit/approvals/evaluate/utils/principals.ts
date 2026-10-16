import type { ApprovalRule, ApprovalRuleParams } from "@autumn/shared";
import type { ApprovalPrincipal } from "@autumn/shared/api/approvals/evaluate/index.js";

const member = ({
	roleId,
	userId = `usr_${roleId}`,
}: {
	roleId: string;
	userId?: string;
}): ApprovalPrincipal => ({ user_id: userId, role_id: roleId });

export const principals = { member } as const;

/**
 * Rules as they come back from storage, in list order: `position` is the index,
 * so a test reads top to bottom. Ids are `apr_<position>` unless given.
 */
export const storedRules = (
	params: (ApprovalRuleParams & { id?: string })[],
): ApprovalRule[] =>
	params.map(({ id, ...rule }, position) => ({
		...rule,
		id: id ?? `apr_${position}`,
		position,
		version: 1,
		updated_by: { user_id: "usr_owner", name: "Owner" },
		created_at: 0,
		updated_at: 0,
	}));

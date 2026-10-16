import type { ApprovalRuleParams } from "@autumn/shared";
import { BUILT_IN_ROLES } from "@autumn/shared/utils/roleUtils/builtInRoles";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { roleRepo } from "@/internal/roles/repos/index.js";
import { handleInvalidApprovalRuleErrors } from "../errors/handleInvalidApprovalRuleErrors.js";
import { listMemberUserIds } from "../repos/listMemberUserIds.js";
import { findUnevaluableConditions } from "../utils/findUnevaluableConditions.js";
import { findUnknownSubjects } from "../utils/findUnknownSubjects.js";

/**
 * Checks past the validator: a dry evaluation of the filter and that named roles and users exist.
 * Callers hold the org rule lock, so a role deleted meanwhile can't slip back in.
 */
export const handleUnsavableRuleErrors = async ({
	db,
	orgId,
	rule,
}: {
	db: DrizzleCli;
	orgId: string;
	rule: ApprovalRuleParams;
}) => {
	const customRoles = await roleRepo.list({ db, orgId });
	const roleIds = new Set([
		...BUILT_IN_ROLES.map((role): string => role.id),
		...customRoles.map((role) => role.role),
	]);
	const memberUserIds = await listMemberUserIds({
		db,
		orgId,
		userIds: rule.subjects.flatMap((subject) =>
			subject.type === "user" ? [subject.user_id] : [],
		),
	});

	handleInvalidApprovalRuleErrors({
		issues: [
			...findUnevaluableConditions({
				actions: rule.actions,
				filter: rule.filter,
			}),
			...findUnknownSubjects({
				subjects: rule.subjects,
				roleIds,
				memberUserIds,
			}),
		],
	});
};

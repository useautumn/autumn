import type { DrizzleCli } from "@/db/initDrizzle.js";
import { clearApprovalRulesCache } from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteRoleRuleSubjects } from "@/internal/approvals/repos/deleteRoleRuleSubjects.js";
import { handleBuiltInRoleErrors } from "../errors/handleBuiltInRoleErrors.js";
import { handleRoleInUseErrors } from "../errors/handleRoleInUseErrors.js";
import { handleRoleNotFoundErrors } from "../errors/handleRoleNotFoundErrors.js";
import { roleRepo } from "../repos/index.js";

/** Deletes an unused custom role, its pending invites and the rule subjects naming it. */
export const deleteRole = async ({
	ctx,
	id,
}: {
	ctx: AutumnContext;
	id: string;
}) => {
	const { db, org } = ctx;
	handleBuiltInRoleErrors({ id });
	handleRoleNotFoundErrors({
		id,
		role: await roleRepo.get({ db, orgId: org.id, id }),
	});

	// Members are counted after the invites are cancelled, inside the same transaction:
	// an SSO join that claimed its invite first is then visible here and blocks the delete.
	await db.transaction(async (transaction) => {
		const tx = transaction as unknown as DrizzleCli;
		await roleRepo.delete({ db: tx, orgId: org.id, id });
		await deleteRoleRuleSubjects({ db: tx, orgId: org.id, roleId: id });
		const memberCounts = await roleRepo.countMembers({ db: tx, orgId: org.id });
		handleRoleInUseErrors({ id, memberCount: memberCounts.get(id) ?? 0 });
	});
	await clearApprovalRulesCache({ orgId: org.id });
};

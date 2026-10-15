import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleBuiltInRoleErrors } from "../errors/handleBuiltInRoleErrors.js";
import { handleRoleInUseErrors } from "../errors/handleRoleInUseErrors.js";
import { handleRoleNotFoundErrors } from "../errors/handleRoleNotFoundErrors.js";
import { roleRepo } from "../repos/index.js";

/** Deletes an unused custom role and cancels pending invitations to it. */
export const deleteRole = async ({
	ctx,
	name,
}: {
	ctx: AutumnContext;
	name: string;
}) => {
	const { db, org } = ctx;
	handleBuiltInRoleErrors({ name });
	handleRoleNotFoundErrors({
		name,
		role: await roleRepo.get({ db, orgId: org.id, name }),
	});

	// Members are counted after the invites are cancelled, inside the same transaction:
	// an SSO join that claimed its invite first is then visible here and blocks the delete.
	await db.transaction(async (transaction) => {
		const tx = transaction as unknown as DrizzleCli;
		await roleRepo.delete({ db: tx, orgId: org.id, name });
		const memberCounts = await roleRepo.countMembers({ db: tx, orgId: org.id });
		handleRoleInUseErrors({ name, memberCount: memberCounts.get(name) ?? 0 });
	});
};

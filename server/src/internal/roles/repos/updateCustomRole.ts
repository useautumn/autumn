import {
	approvalRuleSubjects,
	invitation,
	member,
	organizationRole,
	type UpdateRoleParams,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Updates a custom role; a rename also moves its members, pending invites and rule subjects, atomically. */
export const updateCustomRole = async ({
	db,
	orgId,
	name,
	params,
}: {
	db: DrizzleCli;
	orgId: string;
	name: string;
	params: UpdateRoleParams;
}) =>
	db.transaction(async (transaction) => {
		const tx = transaction as unknown as DrizzleCli;
		const newName = params.name ?? name;

		const [role] = await tx
			.update(organizationRole)
			.set({
				role: newName,
				label: params.label,
				access: params.access,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(organizationRole.organizationId, orgId),
					eq(organizationRole.role, name),
				),
			)
			.returning();

		const isRename = newName !== name;
		if (!isRename) return role;

		await tx
			.update(member)
			.set({ role: newName })
			.where(and(eq(member.organizationId, orgId), eq(member.role, name)));
		await tx
			.update(invitation)
			.set({ role: newName })
			.where(
				and(
					eq(invitation.organizationId, orgId),
					eq(invitation.role, name),
					eq(invitation.status, "pending"),
				),
			);
		await tx
			.update(approvalRuleSubjects)
			.set({ subject_id: newName })
			.where(
				and(
					eq(approvalRuleSubjects.org_id, orgId),
					eq(approvalRuleSubjects.subject_type, "role"),
					eq(approvalRuleSubjects.subject_id, name),
				),
			);

		return role;
	});

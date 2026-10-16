import { invitation, member, organizationRole } from "@autumn/shared";
import type { UpdateRoleParams } from "@autumn/shared/api/roles/apiRole";
import { approvalRuleSubjects } from "@autumn/shared/models/approvalModels/index";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const roleSubjectIs = ({ orgId, name }: { orgId: string; name: string }) =>
	and(
		eq(approvalRuleSubjects.org_id, orgId),
		eq(approvalRuleSubjects.subject_type, "role"),
		eq(approvalRuleSubjects.subject_id, name),
	);

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

		// Renamed or deleted since the caller's check: leave every reference alone.
		const isRename = newName !== name;
		if (!role || !isRename) return role;

		// Invites first: an SSO join holding its invite makes this wait, so the member
		// update below then sees the member it inserted.
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
			.update(member)
			.set({ role: newName })
			.where(and(eq(member.organizationId, orgId), eq(member.role, name)));
		// A rule naming both roles keeps one subject row, not two identical keys.
		await tx
			.delete(approvalRuleSubjects)
			.where(
				and(
					roleSubjectIs({ orgId, name: newName }),
					inArray(
						approvalRuleSubjects.rule_id,
						tx
							.select({ rule_id: approvalRuleSubjects.rule_id })
							.from(approvalRuleSubjects)
							.where(roleSubjectIs({ orgId, name })),
					),
				),
			);
		await tx
			.update(approvalRuleSubjects)
			.set({ subject_id: newName })
			.where(roleSubjectIs({ orgId, name }));

		return role;
	});

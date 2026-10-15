import { invitation, organizationRole } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const deleteCustomRole = async ({
	db,
	orgId,
	name,
}: {
	db: DrizzleCli;
	orgId: string;
	name: string;
}) =>
	db.transaction(async (tx) => {
		await tx
			.delete(organizationRole)
			.where(
				and(
					eq(organizationRole.organizationId, orgId),
					eq(organizationRole.role, name),
				),
			);
		// Accepting an invite copies its role onto the member, so it must not outlive the role.
		await tx
			.update(invitation)
			.set({ status: "canceled" })
			.where(
				and(
					eq(invitation.organizationId, orgId),
					eq(invitation.role, name),
					eq(invitation.status, "pending"),
				),
			);
	});

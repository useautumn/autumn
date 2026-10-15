import { invitation, organizationRole } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Deletes the role row and cancels its pending invites; callers run it in their transaction. */
export const deleteCustomRole = async ({
	db,
	orgId,
	name,
}: {
	db: DrizzleCli;
	orgId: string;
	name: string;
}) => {
	// Accepting an invite copies its role onto the member, so it must not outlive the role.
	await db
		.update(invitation)
		.set({ status: "canceled" })
		.where(
			and(
				eq(invitation.organizationId, orgId),
				eq(invitation.role, name),
				eq(invitation.status, "pending"),
			),
		);
	await db
		.delete(organizationRole)
		.where(
			and(
				eq(organizationRole.organizationId, orgId),
				eq(organizationRole.role, name),
			),
		);
};

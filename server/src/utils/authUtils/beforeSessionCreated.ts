import { member } from "@autumn/shared";
import type { Session } from "better-auth";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import { createDefaultOrg } from "@/utils/authUtils/createDefaultOrg.js";

export const beforeSessionCreated = async (session: Session) => {
	try {
		// Impersonation sets its own active org; don't override with the
		// target user's most-recent membership.
		if ((session as { impersonatedBy?: string | null }).impersonatedBy) {
			return;
		}

		const membership = await db.query.member.findFirst({
			where: eq(member.userId, session.userId),
			orderBy: [desc(member.createdAt)],
		});

		if (membership) {
			return {
				data: {
					...session,
					activeOrganizationId: membership.organizationId,
				},
			};
		}

		const orgId = await createDefaultOrg({ session });

		return {
			data: {
				...session,
				activeOrganizationId: orgId,
			},
		};
	} catch (error) {}
};

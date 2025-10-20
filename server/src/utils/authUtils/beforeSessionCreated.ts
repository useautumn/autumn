import { member } from "@autumn/shared";
import type { Session } from "better-auth";
import { eq } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import { createDefaultOrg } from "@/utils/authUtils/createDefaultOrg.js";

export const beforeSessionCreated = async (session: Session) => {
	try {
		console.log(`Running beforeSessionCreated for user ${session.userId}`);

		const membership = await db.query.member.findFirst({
			where: eq(member.userId, session.userId),
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

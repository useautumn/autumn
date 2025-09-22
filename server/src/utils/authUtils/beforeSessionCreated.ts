import { db } from "@/db/initDrizzle.js";
import { Session } from "better-auth";
import { member, session as sessionTable } from "@autumn/shared";
import { eq, desc } from "drizzle-orm";
import { createDefaultOrg } from "@/utils/authUtils/createDefaultOrg.js";

export const beforeSessionCreated = async (session: Session) => {
	try {
		console.log(`Running beforeSessionCreated for user ${session.userId}`);

		let membership = await db.query.member.findFirst({
			where: eq(member.userId, session.userId),
		});

		if (membership) {
			console.log(
				"Returning session with active org ID:",
				membership.organizationId,
			);
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

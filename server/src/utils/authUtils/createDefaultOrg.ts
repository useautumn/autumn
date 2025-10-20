import { invitation, user as userTable } from "@autumn/shared";
import type { Session } from "better-auth";
import type { Organization } from "better-auth/plugins/organization";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";
import { slugify } from "@/utils/genUtils.js";

export const createDefaultOrg = async ({
	session,
}: {
	session: Session;
}): Promise<Organization | undefined> => {
	try {
		const user = await db.query.user.findFirst({
			where: eq(userTable.id, session.userId),
		});

		const invites = await db
			.select()
			.from(invitation)
			.where(
				and(
					eq(invitation.email, user?.email || ""),
					eq(invitation.status, "pending"),
					gt(invitation.expiresAt, new Date()),
				),
			);

		if (invites.length > 0) {
			console.log(
				`Accepting invite for user ${session.userId} to org ${invites[0].organizationId}`,
			);

			await auth.api.addMember({
				body: {
					userId: session.userId,
					role: invites[0].role as any,
					organizationId: invites[0].organizationId,
				},
			});

			await db
				.update(invitation)
				.set({ status: "accepted" })
				.where(eq(invitation.id, invites[0].id));

			console.log(
				`Invite ${invites[0].id} accepted for user ${session.userId}`,
			);

			return invites[0].organizationId as any;
		}

		let userName = user?.name;
		if (!userName) {
			userName = user?.email?.split("@")[0] || "org";
		}

		const res = await auth.api.createOrganization({
			body: {
				name: `${userName}'s Org`,
				slug: `${slugify(userName)}_${Math.floor(10000000 + Math.random() * 90000000)}`,
				userId: session.userId,
			},
		});

		return res?.id as any;
	} catch (error) {
		console.error("Error creating org", error);
		return undefined;
	}
};

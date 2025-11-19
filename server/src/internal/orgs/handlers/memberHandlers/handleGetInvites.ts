import { invitation, user as userTable } from "@autumn/shared";
import { and, eq, gt } from "drizzle-orm";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handleGetInvites = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { userId, db } = ctx;

		const user = await db.query.user.findFirst({
			where: eq(userTable.id, userId ?? ""),
		});

		const invites = await db.query.invitation.findMany({
			where: and(
				eq(invitation.status, "pending"),
				eq(invitation.email, user?.email ?? ""),
				gt(invitation.expiresAt, new Date()),
			),
			with: {
				inviter: true,
				organization: true,
			},
		});

		return c.json({ invites });
	},
});

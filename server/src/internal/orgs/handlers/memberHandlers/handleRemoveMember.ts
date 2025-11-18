import { session as authSession, member, RecaseError } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handleRemoveMember = createRoute({
	body: z.object({
		memberId: z.string(),
		userId: z.string(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { memberId, userId } = c.req.valid("json");
		const { org, db } = ctx;

		// First check if the member exists by memberId
		let existingMember = await db.query.member.findFirst({
			where: and(eq(member.id, memberId), eq(member.organizationId, org.id)),
		});

		if (!existingMember) {
			// Try to find by userId as fallback
			const memberByUserId = await db.query.member.findFirst({
				where: and(
					eq(member.userId, userId),
					eq(member.organizationId, org.id),
				),
			});

			if (!memberByUserId) {
				throw new RecaseError({
					message: "Member not found in this organization",
					code: "MEMBER_NOT_FOUND",
					statusCode: 404,
				});
			}

			// Use the member found by userId
			existingMember = memberByUserId;
		}

		// Remove member from database using the found member
		await db
			.delete(member)
			.where(
				and(
					eq(member.id, existingMember.id),
					eq(member.organizationId, org.id),
				),
			);

		// Revoke all sessions for this user in this organization
		try {
			await db
				.delete(authSession)
				.where(
					and(
						eq(authSession.userId, existingMember.userId),
						eq(authSession.activeOrganizationId, org.id),
					),
				);
		} catch (error) {
			console.warn(`Session revocation failed: ${error}`);
		}

		return c.json({
			message: "Member removed successfully",
		});
	},
});

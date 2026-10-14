import {
	session as authSession,
	member,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handleRemoveMember = createRoute({
	scopes: { ANY: [Scopes.Admin, Scopes.Owner] },
	body: z.object({
		memberId: z.string(),
		userId: z.string(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { memberId, userId } = c.req.valid("json");
		const { org, db } = ctx;

		let existingMember = await db.query.member.findFirst({
			where: and(eq(member.id, memberId), eq(member.organizationId, org.id)),
		});

		if (!existingMember) {
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

			existingMember = memberByUserId;
		}

		const removingOwner = existingMember.role.split(",").includes("owner");
		if (removingOwner && !ctx.scopes.includes(Scopes.Owner)) {
			throw new RecaseError({
				message: "Only owners can remove another owner",
				code: "FORBIDDEN",
				statusCode: 403,
			});
		}

		if (removingOwner) {
			const orgMembers = await db.query.member.findMany({
				where: eq(member.organizationId, org.id),
			});
			const ownerCount = orgMembers.filter((orgMember) =>
				orgMember.role.split(",").includes("owner"),
			).length;
			if (ownerCount <= 1) {
				throw new RecaseError({
					message: "An organization must keep at least one owner",
					code: "LAST_OWNER",
					statusCode: 400,
				});
			}
		}

		await db
			.delete(member)
			.where(
				and(
					eq(member.id, existingMember.id),
					eq(member.organizationId, org.id),
				),
			);

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

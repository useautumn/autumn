import { session as authSession, member } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { handleFrontendReqError } from "@/utils/errorUtils.js";
import { OrgService } from "../OrgService.js";

export const handleGetOrgMembers = async (req: any, res: any) => {
	try {
		const { org, db } = req;
		const orgId = org.id;

		const memberships = await OrgService.getMembers({ db, orgId });
		const invites = await OrgService.getInvites({ db, orgId });

		res.status(200).json({
			memberships,
			invites,
		});
	} catch (error) {
		console.error("Error getting org members:", error);
		handleFrontendReqError({
			req,
			error,
			res,
			action: "get org members",
		});
	}
};

export const handleRemoveMember = async (req: any, res: any) => {
	try {
		const { org, db } = req;
		const { memberId, userId } = req.body;
		const orgId = org.id;

		// First check if the member exists by memberId
		let existingMember = await db.query.member.findFirst({
			where: and(eq(member.id, memberId), eq(member.organizationId, orgId)),
		});

		if (!existingMember) {
			// Try to find by userId as fallback
			const memberByUserId = await db.query.member.findFirst({
				where: and(eq(member.userId, userId), eq(member.organizationId, orgId)),
			});

			if (!memberByUserId) {
				console.warn(
					`Member not found by userId either: userId=${userId}, orgId=${orgId}`,
				);
				return res.status(404).json({
					message: "Member not found in this organization",
					code: "MEMBER_NOT_FOUND",
				});
			}

			// Use the member found by userId
			existingMember = memberByUserId;
		}

		// Remove member from database using the found member
		await db
			.delete(member)
			.where(
				and(eq(member.id, existingMember.id), eq(member.organizationId, orgId)),
			);

		// Revoke all sessions for this user in this organization
		try {
			await db
				.delete(authSession)
				.where(
					and(
						eq(authSession.userId, existingMember.userId),
						eq(authSession.activeOrganizationId, orgId),
					),
				);
		} catch (error) {
			// Log but don't fail the request if session revocation fails
			req.logtail?.warn(
				`Failed to revoke sessions for user ${existingMember.userId} in org ${orgId}:`,
				error,
			);
			console.warn("Session revocation failed:", error);
		}

		res.status(200).json({
			message: "Member removed successfully",
		});
	} catch (error) {
		console.error("Error in handleRemoveMember:", error);
		handleFrontendReqError({
			req,
			error,
			res,
			action: "remove member",
		});
	}
};

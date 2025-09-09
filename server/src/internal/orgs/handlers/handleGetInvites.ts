import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { invitation, user as userTable } from "@autumn/shared";
import { and, eq, gt } from "drizzle-orm";

export const handleGetInvites = async (
  req: ExtendedRequest,
  res: ExtendedResponse
) => {
  try {
    const { userId, db } = req;

    const user = await db.query.user.findFirst({
      where: eq(userTable.id, userId ?? ""),
    });

    const invites = await db.query.invitation.findMany({
      where: and(
        eq(invitation.status, "pending"),
        eq(invitation.email, user?.email ?? ""),
        gt(invitation.expiresAt, new Date())
      ),
      with: {
        inviter: true,
        organization: true,
      },
    });

    // const joinRequests = await db
    //   .select({
    //     id: orgJoinRequests.id,
    //     organizationId: orgJoinRequests.organizationId,
    //     organizationName: organizations.name,
    //     role: orgJoinRequests.role,
    //     status: orgJoinRequests.status,
    //     createdAt: orgJoinRequests.createdAt,
    //     inviterName: user.name,
    //     inviterEmail: user.email,
    //   })
    //   .from(orgJoinRequests)
    //   .innerJoin(
    //     organizations,
    //     eq(orgJoinRequests.organizationId, organizations.id)
    //   )
    //   .innerJoin(user, eq(orgJoinRequests.inviterId, user.id))
    //   .where(
    //     and(
    //       eq(orgJoinRequests.userId, userId),
    //       eq(orgJoinRequests.status, "pending")
    //     )
    //   )
    //   .orderBy(orgJoinRequests.createdAt);

    res.status(200).json({ invites });
  } catch (error) {
    console.error("Error fetching join requests:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

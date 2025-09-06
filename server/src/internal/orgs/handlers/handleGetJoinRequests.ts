import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { invitation, organizations, user } from "@autumn/shared";
import { eq, and } from "drizzle-orm";

export const handleGetJoinRequests = async (
  req: ExtendedRequest,
  res: ExtendedResponse,
) => {
  try {
    const { db, user: sessionUser } = req;
    const userEmail = sessionUser?.email;

    if (!userEmail) {
      return res.status(400).json({ message: "User email not found" });
    }

    const joinRequests = await db
      .select({
        id: invitation.id,
        organizationId: invitation.organizationId,
        organizationName: organizations.name,
        role: invitation.role,
        status: invitation.status,
        createdAt: invitation.expiresAt, // Using expiresAt as createdAt since invitation table doesn't have createdAt
        inviterName: user.name,
        inviterEmail: user.email,
      })
      .from(invitation)
      .innerJoin(organizations, eq(invitation.organizationId, organizations.id))
      .innerJoin(user, eq(invitation.inviterId, user.id))
      .where(
        and(
          eq(invitation.email, userEmail),
          eq(invitation.status, "pending")
        )
      )
      .orderBy(invitation.expiresAt);

    res.status(200).json(joinRequests);
  } catch (error) {
    console.error("Error fetching join requests:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

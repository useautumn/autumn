import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { orgJoinRequests, organizations, user } from "@autumn/shared";
import { eq, and } from "drizzle-orm";

export const handleGetJoinRequests = async (
  req: ExtendedRequest,
  res: ExtendedResponse,
) => {
  try {
    const { userId, db } = req;

    const joinRequests = await db
      .select({
        id: orgJoinRequests.id,
        organizationId: orgJoinRequests.organizationId,
        organizationName: organizations.name,
        role: orgJoinRequests.role,
        status: orgJoinRequests.status,
        createdAt: orgJoinRequests.createdAt,
        inviterName: user.name,
        inviterEmail: user.email,
      })
      .from(orgJoinRequests)
      .innerJoin(organizations, eq(orgJoinRequests.organizationId, organizations.id))
      .innerJoin(user, eq(orgJoinRequests.inviterId, user.id))
      .where(
        and(
          eq(orgJoinRequests.userId, userId),
          eq(orgJoinRequests.status, "pending")
        )
      )
      .orderBy(orgJoinRequests.createdAt);

    res.status(200).json(joinRequests);
  } catch (error) {
    console.error("Error fetching join requests:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

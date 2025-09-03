import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { orgJoinRequests } from "@autumn/shared";
import { eq, and } from "drizzle-orm";
import { auth } from "@/utils/auth.js";

export const handleRespondToJoinRequest = async (
  req: ExtendedRequest,
  res: ExtendedResponse,
) => {
  try {
    const { requestId, action } = req.body; // action: "accept" or "reject"
    const { userId, db } = req;

    // Find the join request
    const joinRequest = await db.query.orgJoinRequests.findFirst({
      where: and(
        eq(orgJoinRequests.id, requestId),
        eq(orgJoinRequests.userId, userId),
        eq(orgJoinRequests.status, "pending")
      ),
    });

    if (!joinRequest) {
      return res.status(404).json({ message: "Join request not found" });
    }

    if (action === "accept") {
      // Add user to organization
      await auth.api.addMember({
        body: {
          organizationId: joinRequest.organizationId,
          userId: joinRequest.userId,
          role: joinRequest.role,
        },
      });
    }

    // Update the join request status
    await db
      .update(orgJoinRequests)
      .set({
        status: action === "accept" ? "accepted" : "rejected",
        updatedAt: new Date(),
      })
      .where(eq(orgJoinRequests.id, requestId));

    res.status(200).json({
      message: `Join request ${action}ed successfully`,
    });
  } catch (error) {
    console.error("Error responding to join request:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

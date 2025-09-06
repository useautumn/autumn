import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { invitation } from "@autumn/shared";
import { eq, and } from "drizzle-orm";
import { auth } from "@/utils/auth.js";

export const handleRespondToJoinRequest = async (
  req: ExtendedRequest,
  res: ExtendedResponse,
) => {
  try {
    const { requestId, action } = req.body; // action: "accept" or "reject"
    const { userId, db, user: sessionUser } = req;
    const userEmail = sessionUser?.email;

    if (!userEmail) {
      return res.status(400).json({ message: "User email not found" });
    }

    // Find the invitation
    const invitationRecord = await db.query.invitation.findFirst({
      where: and(
        eq(invitation.id, requestId),
        eq(invitation.email, userEmail),
        eq(invitation.status, "pending")
      ),
    });

    if (!invitationRecord) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    if (action === "accept") {
      // Add user to organization
      await auth.api.addMember({
        body: {
          organizationId: invitationRecord.organizationId,
          userId: userId,
          role: invitationRecord.role,
        },
      });
    }

    // Update the invitation status
    await db
      .update(invitation)
      .set({
        status: action === "accept" ? "accepted" : "rejected",
      })
      .where(eq(invitation.id, requestId));

    res.status(200).json({
      message: `Invitation ${action}ed successfully`,
    });
  } catch (error) {
    console.error("Error responding to invitation:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

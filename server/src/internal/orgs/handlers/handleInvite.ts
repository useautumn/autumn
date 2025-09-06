import { sendInvitationEmail } from "@/internal/emails/sendInvitationEmail.js";
import { auth } from "@/utils/auth.js";
import {
  handleFrontendReqError,
  handleRequestError,
} from "@/utils/errorUtils.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { user, invitation, member } from "@autumn/shared";
import { eq, and } from "drizzle-orm";
import { Request, Response } from "express";
import { generateId } from "@/utils/genUtils.js";

export const handleInvite = async (
  req: ExtendedRequest,
  res: ExtendedResponse,
) => {
  try {
    const { email, role } = req.body;
    const { org, db, userId } = req;

    const emailUser = await db.query.user.findFirst({
      where: eq(user.email, email),
    });

    if (emailUser) {
      // Check if user is already a member
      const existingMember = await db.query.member.findFirst({
        where: and(
          eq(member.organizationId, org.id),
          eq(member.userId, emailUser.id)
        ),
      });

      if (existingMember) {
        return res.status(400).send({
          message: "User is already a member of this organization",
        });
      }

      // Check if there's already a pending invitation
      const existingInvitation = await db.query.invitation.findFirst({
        where: and(
          eq(invitation.organizationId, org.id),
          eq(invitation.email, email),
          eq(invitation.status, "pending")
        ),
      });

      if (existingInvitation) {
        return res.status(400).send({
          message: "User already has a pending invitation to this organization",
        });
      }

      // Create an invitation for existing user
      const invitationId = generateId("invite");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days
      
      await db.insert(invitation).values({
        id: invitationId,
        organizationId: org.id,
        email: email,
        inviterId: userId,
        role: role,
        status: "pending",
        expiresAt: expiresAt,
      });

      res.status(200).send({
        message: "Invitation sent to user.",
      });
      return;
    }

    res.status(202).send({
      message: "Send invitation to user",
    });
  } catch (error) {
    handleFrontendReqError({
      req,
      res,
      error,
      action: "handleInvite",
    });
  }
};

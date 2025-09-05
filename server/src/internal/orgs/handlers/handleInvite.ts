import { sendInvitationEmail } from "@/internal/emails/sendInvitationEmail.js";
import { auth } from "@/utils/auth.js";
import {
  handleFrontendReqError,
  handleRequestError,
} from "@/utils/errorUtils.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { user, orgJoinRequests, member } from "@autumn/shared";
import { eq, and } from "drizzle-orm";
import { Request, Response } from "express";
import { generateId } from "@/utils/genUtils.js";

export const handleInvite = async (
  req: ExtendedRequest,
  res: ExtendedResponse
) => {
  try {
    const { email, role } = req.body;
    const { org, db, userId } = req;

    // const emailUser = await db.query.user.findFirst({
    //   where: eq(user.email, email),
    // });

    // if (emailUser) {
    //   // Check if user is already a member
    //   const existingMember = await db.query.member.findFirst({
    //     where: and(
    //       eq(member.organizationId, org.id),
    //       eq(member.userId, emailUser.id)
    //     ),
    //   });

    //   if (existingMember) {
    //     return res.status(400).send({
    //       message: "User is already a member of this organization",
    //     });
    //   }

    //   // Check if there's already a pending join request
    //   const existingRequest = await db.query.orgJoinRequests.findFirst({
    //     where: and(
    //       eq(orgJoinRequests.organizationId, org.id),
    //       eq(orgJoinRequests.userId, emailUser.id),
    //       eq(orgJoinRequests.status, "pending")
    //     ),
    //   });

    //   if (existingRequest) {
    //     return res.status(400).send({
    //       message: "User already has a pending invitation to this organization",
    //     });
    //   }

    //   // Create a join request instead of auto-adding
    //   const joinRequestId = generateId("join_req");
    //   const expiresAt = new Date();
    //   expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    //   await db.insert(orgJoinRequests).values({
    //     id: joinRequestId,
    //     organizationId: org.id,
    //     userId: emailUser.id,
    //     inviterId: userId,
    //     role: role,
    //     status: "pending",
    //     createdAt: new Date(),
    //     updatedAt: new Date(),
    //     expiresAt: expiresAt,
    //   });

    //   res.status(200).send({
    //     message: "Invitation sent to user.",
    //   });
    //   return;
    // }

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

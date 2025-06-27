import { sendInvitationEmail } from "@/internal/emails/sendInvitationEmail.js";
import { auth } from "@/utils/auth.js";
import {
  handleFrontendReqError,
  handleRequestError,
} from "@/utils/errorUtils.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { user } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { Request, Response } from "express";

export const handleInvite = async (
  req: ExtendedRequest,
  res: ExtendedResponse,
) => {
  try {
    const { email, role } = req.body;
    const { org, db } = req;

    const emailUser = await db.query.user.findFirst({
      where: eq(user.email, email),
    });

    if (emailUser) {
      await auth.api.addMember({
        body: {
          organizationId: org.id,
          userId: emailUser.id,
          role: role,
        },
      });

      await sendInvitationEmail({
        email: email,
        orgName: org.name,
      });

      res.status(200).send({
        message: "User added to organization",
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

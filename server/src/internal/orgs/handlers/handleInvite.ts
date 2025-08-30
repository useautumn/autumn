import { sendInvitationEmail } from "@/internal/emails/sendInvitationEmail.js";
import { auth } from "@/utils/auth.js";
import {
  handleFrontendReqError,
  handleRequestError,
} from "@/utils/errorUtils.js";
import { user, OrgRole, ROLE_PERMISSIONS, invitation } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { Request, Response } from "express";
import { generateId } from "better-auth";

export const handleInvite = async (
  req: Request,
  res: Response,
) => {
  try {
    const { email, role = OrgRole.Member } = req.body;
    const { org, db, userRole, userPermissions } = req as any;

    // Validate role parameter
    if (!Object.values(OrgRole).includes(role)) {
      return res.status(400).json({
        message: "Invalid role. Must be one of: owner, admin, member",
      });
    }

    // Check permissions for inviting
    if (!userPermissions?.canInviteMembers) {
      return res.status(403).json({
        message: "You don't have permission to invite members",
      });
    }

    // Check if user can assign the requested role
    if (role === OrgRole.Owner && !userPermissions?.canAssignOwner) {
      return res.status(403).json({
        message: "Only owners can assign the owner role",
      });
    }

    if (role === OrgRole.Admin && !userPermissions?.canAssignAdmin) {
      return res.status(403).json({
        message: "You don't have permission to assign admin role",
      });
    }

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

    // For new users, create invitation directly in the database
    const invitationId = generateId();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    await db.insert(invitation).values({
      id: invitationId,
      organizationId: org.id,
      email: email,
      role: role,
      status: "pending",
      expiresAt: expiresAt,
      inviterId: req.user.id,
    });

    // Send invitation email
    await sendInvitationEmail({
      email: email,
      orgName: org.name,
    });

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

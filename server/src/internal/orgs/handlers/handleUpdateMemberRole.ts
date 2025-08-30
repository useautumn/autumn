import { auth } from "@/utils/auth.js";
import {
  handleFrontendReqError,
} from "@/utils/errorUtils.js";
import { OrgRole, ROLE_PERMISSIONS } from "@autumn/shared";
import { member } from "@autumn/shared";
import { eq, and } from "drizzle-orm";
import { Request, Response } from "express";

export const handleUpdateMemberRole = async (
  req: Request,
  res: Response,
) => {
  try {
    const { memberId, role } = req.body;
    const { org, db, userPermissions } = req as any;

    // Validate role parameter
    if (!Object.values(OrgRole).includes(role)) {
      return res.status(400).json({
        message: "Invalid role. Must be one of: owner, admin, member",
      });
    }

    // Check if user has permission to update member roles
    if (!userPermissions?.canAssignAdmin && role === OrgRole.Admin) {
      return res.status(403).json({
        message: "You don't have permission to assign admin role",
      });
    }

    if (!userPermissions?.canAssignOwner && role === OrgRole.Owner) {
      return res.status(403).json({
        message: "Only owners can assign the owner role",
      });
    }

    // Get the member to be updated
    const targetMember = await db.query.member.findFirst({
      where: and(
        eq(member.id, memberId),
        eq(member.organizationId, org.id)
      ),
    });

    if (!targetMember) {
      return res.status(404).json({
        message: "Member not found",
      });
    }

    // Update the member role
    await auth.api.updateMemberRole({
      body: {
        memberId: memberId,
        organizationId: org.id,
        role: role,
      },
    });

    res.status(200).json({
      message: "Member role updated successfully",
    });
  } catch (error) {
    handleFrontendReqError({
      req,
      res,
      error,
      action: "updateMemberRole",
    });
  }
};

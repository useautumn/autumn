import { OrgRole, ROLE_PERMISSIONS } from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { NextFunction, Response } from "express";
import { member } from "@autumn/shared";
import { eq, and } from "drizzle-orm";

export const requireRole = (requiredRole: OrgRole) => {
  return async (req: ExtendedRequest, res: Response, next: NextFunction) => {
    try {
      const { db, orgId, user } = req;

      if (!user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get user's membership in the current organization
      const membership = await db.query.member.findFirst({
        where: and(
          eq(member.userId, user.id),
          eq(member.organizationId, orgId)
        ),
      });

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }

      const userRole = membership.role as OrgRole;
      const userPermissions = ROLE_PERMISSIONS[userRole];

      // Check if user has the required role or higher
      const roleHierarchy = {
        [OrgRole.Owner]: 3,
        [OrgRole.Admin]: 2,
        [OrgRole.Member]: 1,
      };

      if (roleHierarchy[userRole] >= roleHierarchy[requiredRole]) {
        req.userRole = userRole;
        req.userPermissions = userPermissions;
        next();
      } else {
        return res.status(403).json({ 
          message: `Insufficient permissions. Required role: ${requiredRole}` 
        });
      }
    } catch (error) {
      console.error("Role middleware error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
};

export const requirePermission = (permission: keyof typeof ROLE_PERMISSIONS[OrgRole]) => {
  return async (req: ExtendedRequest, res: Response, next: NextFunction) => {
    try {
      const { db, orgId, user } = req;

      if (!user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get user's membership in the current organization
      const membership = await db.query.member.findFirst({
        where: and(
          eq(member.userId, user.id),
          eq(member.organizationId, orgId)
        ),
      });

      if (!membership) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }

      const userRole = membership.role as OrgRole;
      const userPermissions = ROLE_PERMISSIONS[userRole];

      if (userPermissions[permission]) {
        req.userRole = userRole;
        req.userPermissions = userPermissions;
        next();
      } else {
        return res.status(403).json({ 
          message: `Insufficient permissions. Required permission: ${permission}` 
        });
      }
    } catch (error) {
      console.error("Permission middleware error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
};

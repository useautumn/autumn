import { OrgService } from "@/internal/orgs/OrgService.js";
import { auth } from "@/utils/auth.js";
import { AuthType, ErrCode } from "@autumn/shared";
import { verifyToken } from "@clerk/express";
import { fromNodeHeaders } from "better-auth/node";
import { NextFunction } from "express";

const getTokenData = async (req: any, res: any) => {
  let token;

  try {
    token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      throw new Error("authorization header has no token");
    }
  } catch (error) {
    throw new Error("clerk token not found in request headers / invalid");
  }

  let secretKey = process.env.CLERK_SECRET_KEY;

  try {
    let verified = await verifyToken(token, {
      secretKey: secretKey,
    });

    if (!verified) {
      throw new Error("failed to verify clerk token");
    }

    return verified;
  } catch (error: any) {
    throw new Error("error verifying clerk token");
  }
};

export const withOrgAuth = async (req: any, res: any, next: NextFunction) => {
  const { logtail: logger } = req;

  try {
    // let tokenData = await getTokenData(req, res);
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      logger.info(`Unauthorized - no session found (${req.originalUrl})`);
      return res
        .status(401)
        .json({ message: "Unauthorized - no session found" });
    }

    const orgId = session?.session?.activeOrganizationId;

    if (!orgId) {
      logger.info(`Unauthorized - no org id found`);
      return res
        .status(401)
        .json({ message: "Unauthorized - no org id found" });
    }

    // let tokenOrg = tokenData!.org as any;

    let data = await OrgService.getWithFeatures({
      db: req.db,
      orgId: orgId,
      env: req.env,
    });

    if (!data) {
      logger.warn(`Org ${orgId} not found in DB`);
      return res
        .status(500)
        .json({ message: "Org not found", code: ErrCode.OrgNotFound });
    }

    const { org, features } = data;

    req.user = session?.user;
    req.orgId = orgId;
    req.org = org;
    req.features = features;
    req.authType = AuthType.Dashboard;

    next();
  } catch (error: any) {
    // console.log(`(warning) clerk auth failed:`, error?.message || error);
    logger.warn(`(warning) withOrgAuth failed:`, error?.message || error);
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

export const withAuth = async (req: any, res: any, next: NextFunction) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  req.userId = session?.user.id;

  next();
};

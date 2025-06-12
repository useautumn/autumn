import { OrgService } from "@/internal/orgs/OrgService.js";
import { auth } from "@/utils/auth.js";
import { AuthType } from "@autumn/shared";
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
  try {
    const { logtail: logger } = req;
    // let tokenData = await getTokenData(req, res);
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      logger.info(`Unauthorized - no session found`);
      return res
        .status(401)
        .json({ message: "Unauthorized - no session found" });
    }

    throw new Error("test");

    // if (!tokenData?.org_id) {
    //   throw new Error("token data has no org_id");
    // }

    // let tokenOrg = tokenData!.org as any;

    // let data = await OrgService.getWithFeatures({
    //   db: req.db,
    //   orgId: tokenOrg.id,
    //   env: req.env,
    // });

    // if (!data) {
    //   return res.status(404).json({ message: "Org not found" });
    // }

    // const { org, features } = data;

    // req.minOrg = {
    //   id: tokenOrg?.id,
    //   slug: tokenOrg?.slug,
    // };

    // req.orgId = tokenData!.org_id;
    // req.user = tokenData!.user;
    // req.org = org;
    // req.features = features;
    // req.authType = AuthType.Dashboard;

    next();
  } catch (error: any) {
    console.log(
      // `withOrgAuth error (${req.headers["authorization"]}):`,
      `(warning) clerk auth failed:`,
      error?.message || error,
    );
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

export const withAuth = async (req: any, res: any, next: NextFunction) => {
  // const tokenData = await getTokenData(req, res);

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

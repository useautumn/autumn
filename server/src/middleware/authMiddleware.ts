import { verifyToken } from "@clerk/express";
import { NextFunction } from "express";

const getTokenData = async (req: any, res: any) => {
  let token;

  try {
    token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      throw new Error("No token provided");
    }
  } catch (error) {
    throw new Error("clerk token not found in request headers / invalid");
  }

  let secretKey = process.env.CLERK_SECRET_KEY;
  // let origin = req.headers.origin;
  // if (origin && origin.includes("localhost")) {
  //   secretKey = process.env.CLERK_TEST_SECRET_KEY;
  // }

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
    let tokenData = await getTokenData(req, res);

    if (!tokenData?.org_id) {
      throw new Error("No org in token");
    }

    let tokenOrg = tokenData!.org as any;
    req.minOrg = {
      id: tokenOrg?.id,
      slug: tokenOrg?.slug,
    };

    req.orgId = tokenData!.org_id;
    req.user = tokenData!.user;

    next();
  } catch (error: any) {
    console.log(
      // `withOrgAuth error (${req.headers["authorization"]}):`,
      `(warning) withOrgAuth:`,
      error?.message || error
    );
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

export const withAuth = async (req: any, res: any, next: NextFunction) => {
  const tokenData = await getTokenData(req, res);

  if (!tokenData) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  req.userId = tokenData?.user_id;

  next();
};

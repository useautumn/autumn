import { withOrgAuth } from "./authMiddleware.js";
import { verifyKey } from "@/internal/dev/api-keys/apiKeyUtils.js";
import { verifyBearerPublishableKey } from "./publicAuthMiddleware.js";
import { ErrCode } from "@autumn/shared";

export const verifySecretKey = async (req: any, res: any, next: any) => {
  const authHeader =
    req.headers["authorization"] || req.headers["Authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      error: ErrCode.NoAuthHeader,
      fallback: true,
    };
  }

  const apiKey = authHeader.split(" ")[1];
  if (!apiKey.startsWith("am_")) {
    return {
      error: ErrCode.InvalidAuthHeader,
      fallback: true,
      statusCode: null,
    };
  }

  if (apiKey.startsWith("am_pk")) {
    return await verifyBearerPublishableKey(apiKey, req, res, next);
  }

  // Try verify via Autumn
  try {
    const { valid, data } = await verifyKey({
      sb: req.sb,
      key: apiKey,
      logger: req.logtail,
    });

    if (valid && data) {
      let { org, features, env } = data;
      req.orgId = org.id;
      req.env = env;
      req.minOrg = {
        id: org.id,
        slug: org.slug,
      };
      req.org = org;
      req.features = features;
      next();

      return {
        error: null,
        fallback: null,
        statusCode: null,
      };
    } else {
      console.log(`Autumn API verification failed`);
      return {
        error: ErrCode.FailedToVerifySecretKey,
        fallback: true,
        statusCode: 401,
      };
    }
  } catch (error) {
    console.log("Error: Failed to fetch key from Autumn");
    console.log(error);
    return {
      error: ErrCode.FailedToFetchKeyFromAutumn,
      fallback: true,
      statusCode: 500,
    };
  }
};

export const apiAuthMiddleware = async (req: any, res: any, next: any) => {
  // 1. Verify secret key
  try {
    const { error, fallback, statusCode } = await verifySecretKey(
      req,
      res,
      next
    );

    if (!error) {
      return;
    }

    if (error && !fallback) {
      res.status(statusCode).json({
        message: error,
        code: error,
      });
      return;
    }
  } catch (error) {
    console.log("Error: verifySecretKey failed", error);
    res.status(500).json({
      message: "Failed to verify secret key -- internal server error",
      code: ErrCode.FailedToVerifySecretKey,
    });
    return;
  }

  withOrgAuth(req, res, next);

  // // 2. Verify publishable key (through x-publishable-key header)
  // try {
  //   const { error, fallback, statusCode } = await verifyPublishableKey(
  //     req,
  //     res,
  //     next
  //   );

  //   if (!error) {
  //     return;
  //   }

  //   if (error && !fallback) {
  //     res.status(statusCode).json({
  //       message: error,
  //       code: error,
  //     });
  //     return;
  //   }
  // } catch (error) {
  //   console.log("Error: verifyPublishableKey failed", error);
  //   res.status(500).json({
  //     message: "Failed to verify publishable key -- internal server error",
  //     code: ErrCode.FailedToVerifyPublishableKey,
  //   });
  //   return;
  // }
};

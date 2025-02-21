import { validateApiKey } from "@/external/unkeyUtils.js";
import { withOrgAuth } from "./authMiddleware.js";
import { migrateKey, verifyKey } from "@/internal/dev/api-keys/apiKeyUtils.js";
import { publicAuthMiddleware } from "./publicAuthMiddleware.js";
import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, ErrCode } from "@autumn/shared";
import { OrgService } from "@/internal/orgs/OrgService.js";

export const verifyPublishableKey = async (req: any, res: any, next: any) => {
  const pkey =
    req.headers["x-publishable-key"] || req.headers["X-Publishable-Key"];

  if (!pkey) {
    throw new RecaseError({
      message: "No publishable key",
      code: ErrCode.NoPublishableKey,
      statusCode: 400,
    });
  }

  if (!pkey.startsWith("am_pk_test") && !pkey.startsWith("am_pk_live")) {
    throw new RecaseError({
      message: "Invalid publishable key",
      code: ErrCode.InvalidPublishableKey,
      statusCode: 400,
    });
  }

  let env: AppEnv = pkey.startsWith("am_pk_test")
    ? AppEnv.Sandbox
    : AppEnv.Live;

  // 2. Get orgId from publishable key
  try {
    const org = await OrgService.getFromPkey({
      sb: req.sb,
      pkey: pkey,
      env: env,
    });
    req.org = org;
    req.env = env;
    req.isPublic = true;

    console.log("Public request from:", org.slug);
    next();
  } catch (error: any) {
    throw new RecaseError({
      message: "Invalid publishable key",
      code: ErrCode.InvalidPublishableKey,
      statusCode: 400,
    });
  }
};

export const verifySecretKey = async (req: any, res: any, next: any) => {
  const authHeader =
    req.headers["authorization"] || req.headers["Authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      error: ErrCode.NoAuthHeader,
    };
  }

  const apiKey = authHeader.split(" ")[1];
  if (!apiKey.startsWith("am_")) {
    return {
      error: ErrCode.InvalidAuthHeader,
    };
  }

  // Try verify via Autumn
  try {
    // const timeStart = Date.now();
    const { valid, data } = await verifyKey({ sb: req.sb, key: apiKey });
    // const timeEnd = Date.now();
    // console.log(`Time taken to verify key: ${timeEnd - timeStart}ms`);

    if (valid && data) {
      // console.log(
      //   `Autumn API verification successful for ${data.meta.org_slug} (${data.env})`
      // );
      req.orgId = data.org_id;
      req.env = data.env;
      req.minOrg = {
        id: data.org_id,
        slug: data.meta.org_slug,
      };

      next();
      return;
    } else {
      console.log(`Autumn API verification failed`);
      throw new RecaseError({
        message: "Failed to verify secret key",
        code: ErrCode.FailedToVerifySecretKey,
        statusCode: 401,
      });
    }
  } catch (error) {
    console.log("Error: Failed to fetch key from Autumn");
    console.log("Error: ", error);
    throw new RecaseError({
      message: "Failed to fetch key from Autumn",
      code: ErrCode.FailedToFetchKeyFromAutumn,
      statusCode: 500,
    });
  }
};

export const apiAuthMiddleware = async (req: any, res: any, next: any) => {
  // 1. Verify secret key
  try {
    await verifySecretKey(req, res, next);
    return;
  } catch (error) {
    if (error instanceof RecaseError) {
      if (
        error.code === ErrCode.NoAuthHeader ||
        error.code === ErrCode.InvalidAuthHeader
      ) {
        console.log("Missing / invalid secret key");
      } else {
        console.log("Autumn secret key verification failed");
        console.log("Code:", error.code);
        res.status(error.statusCode).json({
          message: error.message,
        });
        return;
      }
    } else {
      res.status(500).json({
        message: "Failed to verify secret key -- internal server error",
      });
      return;
    }
  }

  // 2. Verify publishable key
  try {
    await verifyPublishableKey(req, res, next);
    return;
  } catch (error: any) {
    if (error instanceof RecaseError) {
      console.log("Publishable key verification failed");
      console.log("Code:", error.code);
      res.status(error.statusCode).json({
        message: error.message,
      });
    }
  }

  // 2. Verify publishable key

  const pkey =
    req.headers["x-publishable-key"] || req.headers["X-Publishable-Key"];

  if (pkey) {
    verifyPublishableKey(req, res, next);
    return;
  }

  // else {
  //   withOrgAuth(req, res, next);
  //   return;
  // }

  // Fallback: Verify via Unkey
  try {
    const result = await validateApiKey(apiKey);

    req.orgId = result.ownerId;
    req.env = result.environment;
    req.minOrg = {
      id: result.ownerId,
      slug: result.meta?.org_slug,
    };

    next();
  } catch (error) {
    console.log("WARNING: Unkey API verification failed");
    console.log(error);
    withOrgAuth(req, res, next);
    return;
  }
};

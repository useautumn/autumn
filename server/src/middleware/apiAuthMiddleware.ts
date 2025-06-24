import { withOrgAuth } from "./authMiddleware.js";
import { verifyKey } from "@/internal/dev/api-keys/apiKeyUtils.js";
import { verifyBearerPublishableKey } from "./publicAuthMiddleware.js";
import { AuthType, ErrCode } from "@autumn/shared";
import { floatToVersion } from "@/utils/versionUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { dashboardOrigins } from "@/utils/constants.js";

const verifyApiVersion = (version: string) => {
  let versionFloat = parseFloat(version);
  let apiVersion = floatToVersion(versionFloat);

  if (isNaN(versionFloat) || !apiVersion) {
    throw new RecaseError({
      message: `${version} is not a valid API version`,
      code: ErrCode.InvalidApiVersion,
      statusCode: 400,
    });
  }

  return apiVersion;
};

const maskApiKey = (apiKey: string) => {
  return apiKey.slice(0, 15) + apiKey.slice(15).replace(/./g, "*");
};

export const verifySecretKey = async (req: any, res: any, next: any) => {
  const authHeader =
    req.headers["authorization"] || req.headers["Authorization"];

  const logger = req.logtail;
  const version = req.headers["x-api-version"];

  if (version) {
    req.apiVersion = verifyApiVersion(version);
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    let origin = req.get("origin");
    if (dashboardOrigins.includes(origin)) {
      return withOrgAuth(req, res, next);
    } else {
      throw new RecaseError({
        message: "Secret key not found in Authorization header",
        code: ErrCode.NoSecretKey,
        statusCode: 401,
      });
    }
  }

  const apiKey = authHeader.split(" ")[1];

  if (!apiKey.startsWith("am_")) {
    throw new RecaseError({
      message: "Invalid secret key",
      code: ErrCode.InvalidSecretKey,
      statusCode: 401,
    });
  }

  if (apiKey.startsWith("am_pk")) {
    return await verifyBearerPublishableKey(apiKey, req, res, next);
  }

  const { valid, data } = await verifyKey({
    db: req.db,
    key: apiKey,
  });

  if (!valid || !data) {
    throw new RecaseError({
      message: "Invalid secret key",
      code: ErrCode.InvalidSecretKey,
      statusCode: 401,
    });
  }

  let { org, features, env } = data;
  req.orgId = org.id;
  req.env = env;
  req.minOrg = {
    id: org.id,
    slug: org.slug,
  };
  req.org = org;
  req.features = features;
  req.authType = AuthType.SecretKey;

  next();
};

export const apiAuthMiddleware = async (req: any, res: any, next: any) => {
  const logger = req.logtail;
  try {
    await verifySecretKey(req, res, next);

    return;
  } catch (error: any) {
    if (error instanceof RecaseError) {
      if (error.code === ErrCode.InvalidSecretKey) {
        let apiKey = req.headers["authorization"]?.split(" ")[1];
        error.message = `Invalid secret key: ${maskApiKey(apiKey)}`;
      }

      logger.warn(`auth warning: ${error.message}`);

      res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
    } else {
      logger.error(`auth error: ${error.message}`, {
        error,
      });
      res.status(500).json({
        message: `Failed to verify secret key: ${error.message}`,
        code: ErrCode.InternalError,
      });
    }

    return;
  }
};

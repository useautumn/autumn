import { validateApiKey } from "@/external/unkeyUtils.js";
import { withOrgAuth } from "./authMiddleware.js";

const API_KEY_LENGTH = 32;
export const apiAuthMiddleware = async (req: any, res: any, next: any) => {
  const authHeader =
    req.headers["authorization"] || req.headers["Authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("Invalid API key / token");
    res.status(401).json({ message: "Invalid API key / token" });
    return;
  }

  const apiKey = authHeader.split(" ")[1];
  if (!apiKey.startsWith("am_") || apiKey.length !== API_KEY_LENGTH) {
    // console.log("Invalid API Key, verifying clerk token");
    withOrgAuth(req, res, next);
    return;
  }

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
    console.log("Failed to verify API Key");
    withOrgAuth(req, res, next);
    return;
  }
};

export const wsAuthMiddleware = async (req: any) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { data: null, error: "Unauthorized" };
  }

  const apiKey = authHeader.split(" ")[1];
  if (!apiKey.startsWith("am_") || apiKey.length !== API_KEY_LENGTH) {
    return { data: null, error: "Unauthorized" };
  }

  try {
    const result = await validateApiKey(apiKey);

    return {
      data: {
        env: result.environment,
        orgId: result.ownerId,
        minOrg: {
          id: result.ownerId,
          slug: result.meta?.org_slug,
        },
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: "Unauthorized" };
  }
};

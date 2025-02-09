import { validateApiKey } from "@/external/unkeyUtils.js";
import { withOrgAuth } from "./authMiddleware.js";
import { migrateKey, verifyKey } from "@/internal/dev/api-keys/apiKeyUtils.js";

export const apiAuthMiddleware = async (req: any, res: any, next: any) => {
  const authHeader =
    req.headers["authorization"] || req.headers["Authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("No authorization header");
    res
      .status(401)
      .json({ message: "Unauthorized -- did you forget to add an API key?" });
    return;
  }

  const apiKey = authHeader.split(" ")[1];
  if (!apiKey.startsWith("am_")) {
    withOrgAuth(req, res, next);
    return;
  }

  // Try verify via Autumn
  try {
    const timeStart = Date.now();
    const { valid, data } = await verifyKey({ sb: req.sb, key: apiKey });
    const timeEnd = Date.now();
    console.log(`Time taken to verify key: ${timeEnd - timeStart}ms`);

    if (valid && data) {
      console.log(
        `Autumn API verification successful for ${data.meta.org_slug} (${data.env})`
      );
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
    }
  } catch (error) {
    console.log("Failed to fetch key from Autumn");
  }

  // Fallback: Verify via Unkey
  try {
    const result = await validateApiKey(apiKey);

    await migrateKey({
      sb: req.sb,
      keyId: result.keyId ?? "",
      meta: { org_slug: result.meta?.org_slug },
      apiKey,
    });

    console.log(`Unkey verification successul for ${result.meta?.org_slug}`);
    req.orgId = result.ownerId;
    req.env = result.environment;
    req.minOrg = {
      id: result.ownerId,
      slug: result.meta?.org_slug,
    };

    next();
  } catch (error) {
    console.log("Unkey  API verification failed");
    withOrgAuth(req, res, next);
    return;
  }
};

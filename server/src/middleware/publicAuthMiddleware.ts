import { OrgService } from "@/internal/orgs/OrgService.js";
import { AppEnv } from "@autumn/shared";

const allowedEndpoints = ["/entitled", "/attach"];
export const publicAuthMiddleware = async (req: any, res: any, next: any) => {
  const pkey = req.headers["x-publishable-key"];

  console.log("Request:", req.originalUrl);

  if (!pkey) {
    console.log("No pkey:", pkey);
    return res.status(400).json({ message: "Publishable key is required" });
  }

  if (!pkey.startsWith("am_pk_test") && !pkey.startsWith("am_pk_live")) {
    console.log("Invalid pkey:", pkey);
    return res.status(400).json({ message: "Invalid publishable key" });
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
    console.log("Failed to get org from pkey");
    console.log("Error code:", error.code);
    return res.status(400).json({ message: "Invalid publishable key" });
  }
};

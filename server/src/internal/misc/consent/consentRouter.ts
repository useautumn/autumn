import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetConsentApiKeys } from "./handlers/handleGetConsentApiKeys.js";
import { handleGetOrgConsents } from "./handlers/handleGetOrgConsents.js";
import { handleRevokeConsent } from "./handlers/handleRevokeConsent.js";

export const consentRouter = new Hono<HonoEnv>();

consentRouter.get("/", ...handleGetOrgConsents);

consentRouter.get("/:consent_id/api-keys", ...handleGetConsentApiKeys);

consentRouter.delete("/:consent_id", ...handleRevokeConsent);

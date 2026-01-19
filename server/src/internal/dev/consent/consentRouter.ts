import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetConsentApiKeys } from "./handlers/handleGetConsentApiKeys.js";
import { handleGetOrgConsents } from "./handlers/handleGetOrgConsents.js";
import { handleRevokeConsent } from "./handlers/handleRevokeConsent.js";

/**
 * Consent Router - handles org-level OAuth consent management.
 * Uses session auth from the internalRouter middleware.
 *
 * Mounted at /consents in internalRouter.ts
 */
export const consentRouter = new Hono<HonoEnv>();

// GET /consents - List all consents for the current org
consentRouter.get("/", ...handleGetOrgConsents);

// GET /consents/:consent_id/api-keys - Preview API keys linked to a consent
consentRouter.get("/:consent_id/api-keys", ...handleGetConsentApiKeys);

// DELETE /consents/:consent_id - Revoke consent and delete linked resources
consentRouter.delete("/:consent_id", ...handleRevokeConsent);

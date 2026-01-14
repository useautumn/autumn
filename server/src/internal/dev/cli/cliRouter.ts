import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateOAuthApiKeys } from "./handlers/handleCreateOAuthApiKeys.js";

/**
 * CLI Router - handles CLI-specific endpoints that use Bearer token auth (OAuth access tokens).
 * These routes do NOT use session auth middleware.
 *
 * Mounted at /cli in initHono.ts
 */
export const cliRouter = new Hono<HonoEnv>();

// POST /cli/api-keys - Create API keys from OAuth access token
cliRouter.post("/api-keys", ...handleCreateOAuthApiKeys);

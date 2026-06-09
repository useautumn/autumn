import {
	oauthProviderAuthServerMetadata,
	oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { type Context, Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { auth } from "@/utils/auth.js";
import { handleGetOAuthClient } from "./handleGetOAuthClient.js";
import { handleMcpOAuthRegistration } from "./handleMcpOAuthRegistration.js";
import { handleOAuthConsentWithEnv } from "./handleOAuthConsentWithEnv.js";
import { handleOAuthTokenWithApiKey } from "./handleOAuthTokenWithApiKey.js";
import { handleInternalMcpOAuthAuthorize } from "./internalMcpOAuthClients.js";

export const oauthRouter = new Hono<HonoEnv>();

const getClientLookupRateLimitKey = (c: Context<HonoEnv>) =>
	c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
	c.req.header("x-real-ip") ??
	c.req.header("cf-connecting-ip") ??
	"unknown";

const oauthClientLookupLimiter = rateLimiter<HonoEnv>({
	windowMs: 60 * 1000,
	limit: process.env.NODE_ENV === "development" ? 1000 : 60,
	standardHeaders: "draft-6",
	keyGenerator: getClientLookupRateLimitKey,
});

oauthRouter.get("/api/auth/.well-known/openid-configuration", (c) => {
	return oauthProviderOpenIdConfigMetadata(auth)(c.req.raw);
});

oauthRouter.get("/.well-known/oauth-authorization-server", (c) => {
	return oauthProviderAuthServerMetadata(auth)(c.req.raw);
});

oauthRouter.get("/api/auth/.well-known/oauth-authorization-server", (c) => {
	return oauthProviderAuthServerMetadata(auth)(c.req.raw);
});

oauthRouter.get("/.well-known/oauth-authorization-server/api/auth", (c) => {
	return oauthProviderAuthServerMetadata(auth)(c.req.raw);
});

oauthRouter.post("/api/auth/oauth2/consent", handleOAuthConsentWithEnv);
oauthRouter.post("/api/auth/oauth2/token", handleOAuthTokenWithApiKey);
oauthRouter.get("/api/auth/oauth2/authorize", handleInternalMcpOAuthAuthorize);
oauthRouter.post("/api/auth/oauth2/register", handleMcpOAuthRegistration);

oauthRouter.get(
	"/oauth/client/:client_id",
	oauthClientLookupLimiter,
	handleGetOAuthClient,
);

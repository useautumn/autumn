import { getProtectedResourceMetadata } from "@autumn/auth/oauth";
import { type Context, Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { getTrustedClientIp } from "@/internal/misc/rateLimiter/public/getTrustedClientIp.js";
import { authBaseUrl } from "@/utils/auth.js";
import { handleAuthServerMetadata } from "./handleAuthServerMetadata.js";
import { handleGetOAuthClient } from "./handleGetOAuthClient.js";
import { handleOAuthAuthorize } from "./handleOAuthAuthorize.js";
import { handleOAuthClientRegistration } from "./handleOAuthClientRegistration.js";
import { handleOAuthConsentWithEnv } from "./handleOAuthConsentWithEnv.js";
import { handleOAuthTokenWithApiKey } from "./handleOAuthTokenWithApiKey.js";
import { handleOpenIdConfiguration } from "./handleOpenIdConfiguration.js";

export const oauthRouter = new Hono<HonoEnv>();

const getOAuthRateLimitKey = (c: Context<HonoEnv>) => getTrustedClientIp({ c });

const oauthClientLookupLimiter = rateLimiter<HonoEnv>({
	windowMs: 60 * 1000,
	limit: process.env.NODE_ENV === "development" ? 1000 : 60,
	standardHeaders: "draft-6",
	keyGenerator: getOAuthRateLimitKey,
});

// Registration is unauthenticated and append-only, so every call writes a row.
const oauthClientRegisterLimiter = rateLimiter<HonoEnv>({
	windowMs: 60 * 60 * 1000,
	limit: process.env.NODE_ENV === "development" ? 1000 : 20,
	standardHeaders: "draft-6",
	keyGenerator: getOAuthRateLimitKey,
});

oauthRouter.get(
	"/api/auth/.well-known/openid-configuration",
	handleOpenIdConfiguration,
);

oauthRouter.get(
	"/.well-known/oauth-authorization-server",
	handleAuthServerMetadata,
);

oauthRouter.get(
	"/api/auth/.well-known/oauth-authorization-server",
	handleAuthServerMetadata,
);

oauthRouter.get(
	"/.well-known/oauth-authorization-server/api/auth",
	handleAuthServerMetadata,
);

oauthRouter.get("/.well-known/oauth-protected-resource", (c) => {
	const baseUrl = authBaseUrl ?? new URL(c.req.url).origin;
	return c.json(
		getProtectedResourceMetadata({
			issuerBaseUrl: baseUrl,
			resourceName: "Autumn API",
			resourceUrl: baseUrl,
		}),
	);
});

oauthRouter.post("/api/auth/oauth2/consent", handleOAuthConsentWithEnv);
oauthRouter.post("/api/auth/oauth2/token", handleOAuthTokenWithApiKey);
oauthRouter.get("/api/auth/oauth2/authorize", handleOAuthAuthorize);
oauthRouter.post(
	"/api/auth/oauth2/register",
	oauthClientRegisterLimiter,
	handleOAuthClientRegistration,
);

oauthRouter.get(
	"/oauth/client/:client_id",
	oauthClientLookupLimiter,
	handleGetOAuthClient,
);

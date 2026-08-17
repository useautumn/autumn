import { getProtectedResourceMetadata } from "@autumn/auth/oauth";
import {
	oauthProviderAuthServerMetadata,
	oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { type Context, Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { auth, authBaseUrl } from "@/utils/auth.js";
import { handleGetOAuthClient } from "./handleGetOAuthClient.js";
import { handleOAuthAuthorize } from "./handleOAuthAuthorize.js";
import { handleOAuthClientRegistration } from "./handleOAuthClientRegistration.js";
import { handleOAuthConsentWithEnv } from "./handleOAuthConsentWithEnv.js";
import { handleOAuthTokenWithApiKey } from "./handleOAuthTokenWithApiKey.js";

export const oauthRouter = new Hono<HonoEnv>();

const getOAuthRateLimitKey = (c: Context<HonoEnv>) =>
	c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
	c.req.header("x-real-ip") ??
	c.req.header("cf-connecting-ip") ??
	"unknown";

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

oauthRouter.get("/api/auth/.well-known/openid-configuration", (c) => {
	return oauthProviderOpenIdConfigMetadata(auth)(c.req.raw);
});

// Codex CLI 0.146.0 drops `iss` from the auth callback, and advertising RFC
// 9207 support makes its OAuth library reject the iss-less (valid) callback.
const handleAuthServerMetadata = async (c: Context<HonoEnv>) => {
	const response = await oauthProviderAuthServerMetadata(auth)(c.req.raw);
	const metadata = (await response.json()) as Record<string, unknown>;
	metadata.authorization_response_iss_parameter_supported = false;
	const headers = new Headers(response.headers);
	headers.delete("Content-Length");
	return new Response(JSON.stringify(metadata), {
		status: response.status,
		headers,
	});
};

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

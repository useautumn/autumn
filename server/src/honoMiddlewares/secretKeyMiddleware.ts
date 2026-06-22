import {
	getBearerToken,
	isCustomerJwt,
	isOAuthToken,
	isPublishableKeyPrefix,
	isSecretKeyPrefix,
} from "@autumn/auth";
import { AuthType, ErrCode, RecaseError, sortFeatures } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { verifyKey } from "@/internal/dev/api-keys/apiKeyUtils.js";
import { handleOAuthMiddleware } from "./authMiddlewares/handleOAuthMiddleware.js";
import { betterAuthMiddleware } from "./betterAuthMiddleware.js";
import { customerJwtMiddleware } from "./customerJwtMiddleware.js";
import { publicKeyMiddleware } from "./publicKeyMiddleware.js";

const maskApiKey = (apiKey: string) => {
	return apiKey.slice(0, 15) + apiKey.slice(15).replace(/./g, "*");
};

/**
 * Middleware to verify secret key and populate auth context
 * Falls back to Better Auth (dashboard session) if request is from dashboard
 * Delegates to publicKeyMiddleware if key is a publishable key (am_pk)
 *
 * Steps:
 * 1. Check if Authorization header is present
 * 2. If from dashboard and no auth header, use Better Auth
 * 3. Check if it has correct Bearer format
 * 4. Handle publishable key verification if key starts with am_pk
 * 5. Verify the secret API key
 * 6. Store org, features, env, userId, authType in context
 */
export const secretKeyMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");

	if (c.req.header("x-client-type") === "dashboard") {
		return betterAuthMiddleware(c, next);
	}

	const bearerToken = getBearerToken({ headers: c.req.raw.headers });

	// Step 1 & 2: Check if Authorization header exists
	// If from dashboard and no Bearer token, use Better Auth session instead
	if (!bearerToken) {
		throw new RecaseError({
			message: "Secret key not found in Authorization header",
			code: ErrCode.NoSecretKey,
			statusCode: 401,
		});
	}

	if (isOAuthToken({ token: bearerToken })) {
		return handleOAuthMiddleware({ c, token: bearerToken, next });
	}

	// Per-customer JWT: scoped credential for self-hosted / licensed apps.
	if (isCustomerJwt({ token: bearerToken })) {
		return customerJwtMiddleware(c, bearerToken, next);
	}

	// Step 3: Handle publishable key verification
	if (isPublishableKeyPrefix({ token: bearerToken })) {
		return publicKeyMiddleware(c, bearerToken, next);
	}

	if (!isSecretKeyPrefix({ token: bearerToken })) {
		throw new RecaseError({
			message: "Invalid authorization token prefix",
			code: ErrCode.InvalidRequest,
			statusCode: 401,
		});
	}

	// Step 4: Verify the API key
	const { valid, data } = await verifyKey({
		db: ctx.db,
		key: bearerToken,
	});

	if (!valid || !data) {
		const maskedKey = maskApiKey(bearerToken);
		throw new RecaseError({
			message: `Invalid secret key: ${maskedKey}`,
			code: ErrCode.InvalidSecretKey,
			statusCode: 401,
		});
	}

	// Step 5: Store auth data in context
	const { org, features, env, userId } = data;
	const scopes = (data as { scopes?: string[] | null }).scopes ?? [];

	sortFeatures({ features });

	ctx.org = org;
	ctx.features = features;
	ctx.env = env;
	ctx.userId = userId ?? undefined;
	ctx.authType = AuthType.SecretKey;
	ctx.scopes = scopes;
	if (data?.user) {
		ctx.user = data.user;
	}

	await next();
};

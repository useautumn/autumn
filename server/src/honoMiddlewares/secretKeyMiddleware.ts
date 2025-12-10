import { AuthType, ErrCode, type Feature, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { verifyKey } from "@/internal/dev/api-keys/apiKeyUtils.js";
import { betterAuthMiddleware } from "./betterAuthMiddleware.js";
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

	const authHeader =
		c.req.header("authorization") || c.req.header("Authorization");

	// Step 1 & 2: Check if Authorization header exists
	// If from dashboard and no Bearer token, use Better Auth session instead
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		throw new RecaseError({
			message: "Secret key not found in Authorization header",
			code: ErrCode.NoSecretKey,
			statusCode: 401,
		});
	}

	// Step 2: Extract and validate API key format
	const apiKey = authHeader.split(" ")[1];

	if (!apiKey.startsWith("am_")) {
		throw new RecaseError({
			message: `Invalid secret key: ${maskApiKey(apiKey)}`,
			code: ErrCode.InvalidSecretKey,
			statusCode: 401,
		});
	}

	// Step 3: Handle publishable key verification
	if (apiKey.startsWith("am_pk")) {
		return publicKeyMiddleware(c, apiKey, next);
	}

	// Step 4: Verify the API key
	const { valid, data } = await verifyKey({
		db: ctx.db,
		key: apiKey,
	});

	if (!valid || !data) {
		const maskedKey = maskApiKey(apiKey);
		throw new RecaseError({
			message: `Invalid secret key: ${maskedKey}`,
			code: ErrCode.InvalidSecretKey,
			statusCode: 401,
		});
	}

	// Step 5: Store auth data in context
	const { org, features, env, userId } = data;

	if (features) {
		features.sort((a: Feature, b: Feature) => {
			if (a.archived && !b.archived) return 1;
			if (!a.archived && b.archived) return -1;
			return 0;
		});
	}

	ctx.org = org;
	ctx.features = features;
	ctx.env = env;
	ctx.userId = userId;
	ctx.authType = AuthType.SecretKey;
	if (data?.user) {
		ctx.user = data.user;
	}

	await next();
};

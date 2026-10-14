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
import { verifyKey } from "@/internal/dev/apiKeys/actions/verifyKey.js";
import { handleOAuthMiddleware } from "./authMiddlewares/handleOAuthMiddleware.js";
import { betterAuthMiddleware } from "./betterAuthMiddleware.js";
import { customerJwtMiddleware } from "./customerJwtMiddleware.js";
import { publicKeyMiddleware } from "./publicKeyMiddleware.js";

const maskApiKey = (apiKey: string) => {
	return apiKey.slice(0, 15) + apiKey.slice(15).replace(/./g, "*");
};

const CATALOG_WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CATALOG_PATH_REGEX = /^\/(features|products|plans|catalog)/;

const isCatalogWriteRequest = (c: Context<HonoEnv>) => {
	if (!CATALOG_WRITE_METHODS.has(c.req.method)) return false;
	const pathname = new URL(c.req.url).pathname.replace(/^\/v1/, "");
	return CATALOG_PATH_REGEX.test(pathname);
};

export const secretKeyMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");

	if (c.req.header("x-client-type") === "dashboard") {
		return betterAuthMiddleware(c, next);
	}

	const bearerToken = getBearerToken({ headers: c.req.raw.headers });

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

	if (isCustomerJwt({ token: bearerToken })) {
		return customerJwtMiddleware(c, bearerToken, next);
	}

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

	const data = await verifyKey({
		db: ctx.db,
		key: bearerToken,
		requestId: ctx.id,
		skipL1: isCatalogWriteRequest(c),
	});

	if (!data) {
		const maskedKey = maskApiKey(bearerToken);
		throw new RecaseError({
			message: `Invalid secret key: ${maskedKey}`,
			code: ErrCode.InvalidSecretKey,
			statusCode: 401,
		});
	}

	const { org, features, env, userId } = data;
	const scopes = data.scopes ?? [];

	sortFeatures({ features });

	ctx.org = org;
	ctx.features = features;
	ctx.env = env;
	ctx.userId = userId ?? undefined;
	ctx.apiKeyId = data.apiKeyId;
	ctx.authType = AuthType.SecretKey;
	ctx.scopes = scopes;
	if (data.user) {
		ctx.user = data.user;
	}

	await next();
};

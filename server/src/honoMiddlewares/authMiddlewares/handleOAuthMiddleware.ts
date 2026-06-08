import {
	AppEnv,
	AuthType,
	ErrCode,
	RecaseError,
	sortFeatures,
} from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { getOAuthAccessTokenRecord } from "@/internal/auth/oauth/oauthAccessTokenApiKey.js";
import { oauthConsentRepo } from "@/internal/auth/repos/index.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

const getOAuthEnvironment = ({ c }: { c: Context<HonoEnv> }) => {
	const env = c.req.header("x-autumn-environment") ?? AppEnv.Sandbox;
	if (env === AppEnv.Live || env === AppEnv.Sandbox) return env;

	throw new RecaseError({
		message: "Invalid x-autumn-environment",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

export const handleOAuthMiddleware = async ({
	c,
	token,
	next,
}: {
	c: Context<HonoEnv>;
	token: string;
	next: Next;
}) => {
	const ctx = c.get("ctx");
	const env = getOAuthEnvironment({ c });
	const tokenRecord = await getOAuthAccessTokenRecord({
		db: ctx.db,
		accessToken: token,
		resource: c.req.header("x-autumn-oauth-resource") ?? null,
		requestedScopes: null,
	});
	const consent = await oauthConsentRepo.getForClientUserOrg({
		db: ctx.db,
		clientId: tokenRecord.clientId,
		userId: tokenRecord.userId,
		referenceId: tokenRecord.referenceId,
		env,
	});

	if (!consent) {
		throw new RecaseError({
			message: "OAuth consent not found for environment",
			code: ErrCode.InvalidRequest,
			statusCode: 401,
		});
	}

	const data = await OrgService.getWithFeatures({
		db: ctx.db,
		orgId: tokenRecord.referenceId,
		env,
	});
	if (!data) {
		throw new RecaseError({
			message: "Org not found",
			code: ErrCode.OrgNotFound,
			statusCode: 404,
		});
	}

	ctx.org = data.org;
	ctx.features = sortFeatures({ features: data.features }) ?? [];
	ctx.env = env;
	ctx.userId = tokenRecord.userId;
	ctx.oauthResource = c.req.header("x-autumn-oauth-resource") ?? undefined;
	ctx.authType = AuthType.SecretKey;
	ctx.scopes = tokenRecord.scopes;

	await next();
};

import { stripOAuthTokenPrefix } from "@autumn/auth";
import {
	AppEnv,
	AuthType,
	ErrCode,
	type Feature,
	features,
	oauthAccessToken,
	oauthConsent,
	OrgConfigSchema,
	type Organization,
	organizations,
	RecaseError,
	sortFeatures,
} from "@autumn/shared";
import { and, eq, gt, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { hashOAuthToken } from "@/utils/oauthUtils.js";

const masterOrg = alias(organizations, "master_org");

const getOAuthEnvironment = ({ env }: { env?: AppEnv | null }) => {
	if (env === AppEnv.Live || env === AppEnv.Sandbox) return env;

	throw new RecaseError({
		message: "OAuth token is missing an environment",
		code: ErrCode.InvalidRequest,
		statusCode: 401,
	});
};

const getOAuthTokenValues = async ({ token }: { token: string }) => {
	const rawAccessToken = stripOAuthTokenPrefix({ token });
	const hashedToken = await hashOAuthToken(rawAccessToken);
	return [...new Set([hashedToken, rawAccessToken])];
};

const getOAuthRequestContext = async ({
	c,
	token,
}: {
	c: Context<HonoEnv>;
	token: string;
}) => {
	const ctx = c.get("ctx");
	const tokenValues = await getOAuthTokenValues({ token });
	const rows = await ctx.db
		.select({
			tokenUserId: oauthAccessToken.userId,
			tokenScopes: oauthAccessToken.scopes,
			consentEnv: oauthConsent.env,
			org: organizations,
			masterOrg,
			feature: features,
		})
		.from(oauthAccessToken)
		.innerJoin(
			oauthConsent,
			eq(oauthAccessToken.oauthConsentId, oauthConsent.id),
		)
		.innerJoin(organizations, eq(oauthAccessToken.referenceId, organizations.id))
		.leftJoin(masterOrg, eq(organizations.created_by, masterOrg.id))
		.leftJoin(
			features,
			and(
				eq(features.org_id, organizations.id),
				eq(features.env, oauthConsent.env),
			),
		)
		.where(
			and(
				inArray(oauthAccessToken.token, tokenValues),
				gt(oauthAccessToken.expiresAt, new Date()),
			),
		);

	const first = rows[0];
	if (!first) {
		throw new RecaseError({
			message: "Invalid or expired access token",
			code: ErrCode.InvalidRequest,
			statusCode: 401,
		});
	}

	const env = getOAuthEnvironment({ env: first.consentEnv });
	if (!first.tokenUserId) {
		throw new RecaseError({
			message: "Token missing user information",
			code: ErrCode.InvalidRequest,
			statusCode: 401,
		});
	}

	const master: Organization | null = first.masterOrg
		? {
				...first.masterOrg,
				master: null,
				config: OrgConfigSchema.parse(first.masterOrg.config || {}),
			}
		: null;
	const org: Organization = {
		...first.org,
		master,
		config: OrgConfigSchema.parse(first.org.config || {}),
	};
	const orgFeatures = rows.flatMap((row) =>
		row.feature ? [row.feature] : [],
	) as unknown as Feature[];

	return {
		env,
		features: orgFeatures,
		org,
		scopes: first.tokenScopes,
		userId: first.tokenUserId,
	};
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
	const data = await getOAuthRequestContext({ c, token });

	ctx.org = data.org;
	ctx.features = sortFeatures({ features: data.features }) ?? [];
	ctx.env = data.env;
	ctx.userId = data.userId;
	ctx.oauthResource = c.req.header("x-autumn-oauth-resource") ?? undefined;
	ctx.authType = AuthType.SecretKey;
	ctx.scopes = data.scopes;

	await next();
};

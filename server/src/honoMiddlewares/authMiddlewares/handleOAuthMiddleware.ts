import { stripOAuthTokenPrefix } from "@autumn/auth";
import {
	getProtectedResourceMetadataUrl,
	getWwwAuthenticateHeader,
	isUnrestrictedChatOAuthConsent,
} from "@autumn/auth/oauth";
import { getAutumnEnv } from "@autumn/env";
import {
	AppEnv,
	AuthType,
	ErrCode,
	type Feature,
	features,
	type Organization,
	OrgConfigSchema,
	oauthAccessToken,
	oauthConsent,
	organizations,
	RecaseError,
	sortFeatures,
} from "@autumn/shared";
import { getOAuthTokenValues } from "@autumn/shared/utils/auth/oauthAccessTokens";
import { and, eq, gt, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { isServedOAuthAudience } from "@/internal/auth/oauth/oauthResourceAudiences.js";

const masterOrg = alias(organizations, "master_org");

/**
 * RFC 8707 audience binding: a grant stamped for an audience no Autumn resource
 * server fronts is refused here rather than honoured as a bearer token.
 *
 * This is the one 401 in this middleware that carries a challenge, because it is
 * the one an otherwise well-formed client can recover from by re-authorizing
 * against the right resource.
 */
const assertTokenAudienceIsServed = ({
	c,
	grantResource,
}: {
	c: Context<HonoEnv>;
	grantResource: string | null;
}) => {
	if (isServedOAuthAudience({ grantResource })) return;

	c.header(
		"WWW-Authenticate",
		getWwwAuthenticateHeader({
			error: "invalid_token",
			resourceMetadataUrl: getProtectedResourceMetadataUrl({
				resourceUrl: getAutumnEnv().AUTUMN_API_URL,
			}),
		}),
	);
	throw new RecaseError({
		message: "OAuth token was not issued for this resource",
		code: ErrCode.InvalidRequest,
		statusCode: 401,
	});
};

const getOAuthEnvironment = ({ env }: { env?: AppEnv | null }) => {
	if (env === AppEnv.Live || env === AppEnv.Sandbox) return env;

	throw new RecaseError({
		message: "OAuth token is missing an environment",
		code: ErrCode.InvalidRequest,
		statusCode: 401,
	});
};

/**
 * The route scope check fails open on an empty scope list, so a scope-less OAuth
 * grant is admin-equivalent here. Only Leaf's unrestricted chat consent may hold
 * one; the consent row is already joined, so this costs no extra query.
 */
const assertScopeLessGrantIsAllowed = ({
	consentMetadata,
	scopes,
}: {
	consentMetadata: Record<string, unknown> | null;
	scopes: string[];
}) => {
	if (scopes.length > 0) return;
	if (isUnrestrictedChatOAuthConsent({ metadata: consentMetadata })) return;

	throw new RecaseError({
		message: "OAuth token has no scopes",
		code: ErrCode.InsufficientScopes,
		statusCode: 403,
	});
};

const getOAuthRequestContext = async ({
	c,
	token,
}: {
	c: Context<HonoEnv>;
	token: string;
}) => {
	const ctx = c.get("ctx");
	const tokenValues = getOAuthTokenValues(stripOAuthTokenPrefix({ token }));
	const rows = await ctx.db
		.select({
			tokenUserId: oauthAccessToken.userId,
			tokenResource: oauthAccessToken.resource,
			tokenScopes: oauthAccessToken.scopes,
			consentEnv: oauthConsent.env,
			consentMetadata: oauthConsent.metadata,
			org: organizations,
			masterOrg,
			feature: features,
		})
		.from(oauthAccessToken)
		.innerJoin(
			oauthConsent,
			eq(oauthAccessToken.oauthConsentId, oauthConsent.id),
		)
		.innerJoin(
			organizations,
			eq(oauthAccessToken.referenceId, organizations.id),
		)
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

	assertTokenAudienceIsServed({ c, grantResource: first.tokenResource });

	const env = getOAuthEnvironment({ env: first.consentEnv });
	if (!first.tokenUserId) {
		throw new RecaseError({
			message: "Token missing user information",
			code: ErrCode.InvalidRequest,
			statusCode: 401,
		});
	}

	assertScopeLessGrantIsAllowed({
		consentMetadata: first.consentMetadata,
		scopes: first.tokenScopes,
	});

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
	ctx.authType = AuthType.SecretKey;
	ctx.scopes = data.scopes;

	await next();
};

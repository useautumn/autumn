import { createHash } from "node:crypto";
import {
	getBearerToken,
	isOAuthToken,
	isSecretKeyPrefix,
	stripOAuthTokenPrefix,
} from "@autumn/auth";
import {
	getProtectedResourceMetadataUrl,
	getWwwAuthenticateHeader,
	isUnrestrictedChatOAuthConsent,
	oauthAudienceAllowsResource,
} from "@autumn/auth/oauth";
import {
	type AutumnMcpAuth,
	DEFAULT_API_VERSION,
	environmentSchema,
	type MCPServerFlags,
	type OAuthEnvironment,
} from "@autumn/mcp";
import { DEFAULT_OAUTH_RESOURCE_SCOPES, oauthConsent } from "@autumn/shared";
import {
	findActiveOAuthAccessToken,
	type OAuthAccessTokenDb,
} from "@autumn/shared/utils/auth/oauthAccessTokens";
import { getRequestedOAuthResourceScopes } from "@autumn/shared/utils/auth/oauthScopeUtils";
import { eq } from "drizzle-orm";
import * as z from "zod/v4";
import { OAuthHttpError } from "./protectedResourceMetadata.js";

/**
 * The transport cannot know which tool a session will reach, so every challenge
 * names the full advertised set and one step-up authorization covers them all.
 *
 * `error` is omitted for a request that presented no credentials at all: RFC
 * 6750 §3.1 reserves the error codes for a request that did present a token.
 */
const buildChallenge = ({
	error,
	resourceUrl,
}: {
	error?: string;
	resourceUrl: string;
}) =>
	getWwwAuthenticateHeader({
		error,
		resourceMetadataUrl: getProtectedResourceMetadataUrl({ resourceUrl }),
		scopes: DEFAULT_OAUTH_RESOURCE_SCOPES,
	});

type AuthLogger = {
	warning: (message: string, data?: Record<string, unknown>) => void;
};

export interface MCPOAuthFlags extends MCPServerFlags {
	readonly "oauth-enabled"?: boolean | undefined;
	readonly "oauth-environment"?: OAuthEnvironment | undefined;
}

const xApiVersionSchema = z.string().default(DEFAULT_API_VERSION);
const secretKeySchema = z.string().min(1).optional();
const failOpenSchema = z
	.union([
		z.boolean(),
		z.enum(["true", "false"]).transform((v) => v === "true"),
	])
	.default(true);

const parseRequestOption = <T>({
	value,
	schema,
	message,
}: {
	value: unknown;
	schema: z.ZodType<T>;
	message: string;
}): T => {
	const parsed = schema.safeParse(value);
	if (parsed.success) return parsed.data;

	throw new OAuthHttpError({
		error: "invalid_request",
		message,
		status: 400,
	});
};

const getEnvironment = ({
	headers,
	flags,
}: {
	headers: Headers;
	flags: MCPOAuthFlags;
}): OAuthEnvironment =>
	parseRequestOption({
		value:
			headers.get("x-autumn-environment") ??
			flags["oauth-environment"] ??
			"sandbox",
		schema: environmentSchema,
		message: "Invalid x-autumn-environment",
	});

const getStaticApiKey = ({
	headers,
	flags,
}: {
	headers: Headers;
	flags: MCPOAuthFlags;
}): string | undefined => {
	const secretKey = headers.get("secret-key");
	if (secretKey && isSecretKeyPrefix({ token: secretKey })) return secretKey;

	const bearer = getBearerToken({ headers });
	if (bearer && isSecretKeyPrefix({ token: bearer })) return bearer;

	const fallbackSecretKey = flags["secret-key"];
	if (
		!flags["oauth-enabled"] &&
		fallbackSecretKey &&
		isSecretKeyPrefix({ token: fallbackSecretKey })
	) {
		return fallbackSecretKey;
	}

	return undefined;
};

const principalFromSecret = ({
	kind,
	value,
}: {
	kind: string;
	value: string;
}) => {
	const digest = createHash("sha256").update(value).digest("hex").slice(0, 32);
	return `${kind}:${digest}`;
};

const isUnrestrictedChatGrant = async ({
	accessToken,
	db,
}: {
	accessToken: { oauthConsentId: string | null };
	db: OAuthAccessTokenDb;
}) => {
	if (!accessToken.oauthConsentId) return false;

	const consent = await db.query.oauthConsent.findFirst({
		columns: { metadata: true },
		where: eq(oauthConsent.id, accessToken.oauthConsentId),
	});
	return isUnrestrictedChatOAuthConsent({ metadata: consent?.metadata });
};

/**
 * Liveness is checked against the shared token store, the same check the api
 * server's OAuth middleware applies, so an expired token gets a transport-level
 * 401 challenge here instead of surfacing as a tool error.
 */
const resolveOAuthPrincipal = async ({
	bearer,
	db,
	resourceUrl,
}: {
	bearer: string;
	db: OAuthAccessTokenDb;
	resourceUrl: string;
}) => {
	const accessToken = await findActiveOAuthAccessToken({
		db,
		rawAccessToken: stripOAuthTokenPrefix({ token: bearer }),
	});

	if (!accessToken?.userId || !accessToken.referenceId) {
		throw new OAuthHttpError({
			error: "invalid_token",
			message: "Invalid or expired OAuth access token",
			status: 401,
			wwwAuthenticate: buildChallenge({ error: "invalid_token", resourceUrl }),
		});
	}

	// RFC 8707 audience binding: this resource server only accepts tokens minted for it.
	if (
		!oauthAudienceAllowsResource({
			grantResource: accessToken.resource,
			resourceUrl,
		})
	) {
		throw new OAuthHttpError({
			error: "invalid_token",
			message: "OAuth access token was not issued for this resource",
			status: 401,
			wwwAuthenticate: buildChallenge({ error: "invalid_token", resourceUrl }),
		});
	}

	const scopes = getRequestedOAuthResourceScopes(accessToken.scopes);

	// A grant that names scopes must expose at least one this resource serves; an
	// empty grant is admin-equivalent, so re-derive the right to hold one from the
	// consent instead of trusting the token row.
	const hasUsableGrant =
		accessToken.scopes.length > 0
			? scopes.length > 0
			: await isUnrestrictedChatGrant({ db, accessToken });

	if (!hasUsableGrant) {
		throw new OAuthHttpError({
			error: "insufficient_scope",
			message: "OAuth access token grants no Autumn resource scopes",
			status: 403,
			wwwAuthenticate: buildChallenge({
				error: "insufficient_scope",
				resourceUrl,
			}),
		});
	}

	return {
		orgId: accessToken.referenceId,
		userId: accessToken.userId,
		scopes,
	};
};

export const buildAuthForRequest = async ({
	headers,
	db,
	flags,
	logger,
	resourceUrl,
}: {
	headers: Headers;
	db: OAuthAccessTokenDb;
	flags: MCPOAuthFlags;
	logger: AuthLogger;
	resourceUrl: string;
}): Promise<AutumnMcpAuth> => {
	const env = getEnvironment({ headers, flags });
	const xApiVersion = parseRequestOption({
		value: headers.get("x-api-version") ?? flags["x-api-version"],
		schema: xApiVersionSchema,
		message: "Invalid x-api-version",
	});
	const failOpen = parseRequestOption({
		value: headers.get("fail-open") ?? flags["fail-open"],
		schema: failOpenSchema,
		message: "Invalid fail-open",
	});
	const apiKey = parseRequestOption({
		value: getStaticApiKey({ headers, flags }),
		schema: secretKeySchema,
		message: "Invalid secret-key",
	});

	if (apiKey) {
		return {
			apiKey,
			authMethod: "secret-key",
			env,
			resource: resourceUrl,
			principalId: principalFromSecret({ kind: "secret-key", value: apiKey }),
			scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
			serverURL: flags["server-url"],
			xApiVersion,
			failOpen,
		};
	}

	const bearer = getBearerToken({ headers });
	if (bearer && isOAuthToken({ token: bearer })) {
		const identity = await resolveOAuthPrincipal({
			bearer,
			db,
			resourceUrl,
		});
		return {
			apiKey: bearer,
			authMethod: "oauth",
			env,
			orgId: identity.orgId,
			resource: resourceUrl,
			principalId: principalFromSecret({
				kind: "oauth",
				value: `${identity.orgId}:${identity.userId}`,
			}),
			scopes: identity.scopes,
			serverURL: flags["server-url"],
			xApiVersion,
			failOpen,
		};
	}

	if (bearer) {
		throw new OAuthHttpError({
			error: "invalid_token",
			message: "Invalid OAuth token prefix",
			status: 401,
			wwwAuthenticate: buildChallenge({ error: "invalid_token", resourceUrl }),
		});
	}

	// Neither branch below answers a presented credential, so RFC 6750 §3.1
	// leaves both without an error code — in the body as well as the header.
	if (flags["oauth-enabled"]) {
		throw new OAuthHttpError({
			message: "Missing Autumn API key bearer token",
			status: 401,
			wwwAuthenticate: buildChallenge({ resourceUrl }),
		});
	}

	logger.warning("Missing secret-key for MCP request");
	throw new OAuthHttpError({ message: "Missing secret-key", status: 401 });
};

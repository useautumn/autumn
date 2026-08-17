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
	oauthAudienceAllowsResource,
} from "@autumn/auth/oauth";
import {
	type AutumnMcpAuth,
	DEFAULT_API_VERSION,
	environmentSchema,
	type MCPServerFlags,
	type OAuthEnvironment,
} from "@autumn/mcp";
import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";
import {
	findActiveOAuthAccessToken,
	type OAuthAccessTokenDb,
} from "@autumn/shared/utils/auth/oauthAccessTokens";
import { getRequestedOAuthResourceScopes } from "@autumn/shared/utils/auth/oauthScopeUtils";
import * as z from "zod/v4";
import { OAuthHttpError } from "./protectedResourceMetadata.js";

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

	throw new OAuthHttpError(400, message, "invalid_request");
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

const getInvalidTokenChallenge = (resourceUrl: string) =>
	getWwwAuthenticateHeader({
		resourceMetadataUrl: getProtectedResourceMetadataUrl({ resourceUrl }),
		scopes: DEFAULT_OAUTH_RESOURCE_SCOPES,
		error: "invalid_token",
	});

const invalidTokenError = ({
	message,
	resourceUrl,
}: {
	message: string;
	resourceUrl: string;
}) =>
	new OAuthHttpError(
		401,
		message,
		"invalid_token",
		getInvalidTokenChallenge(resourceUrl),
	);

/**
 * Authenticates an OAuth bearer against the shared token store — the same
 * expiry check the api server's OAuth middleware applies — so expired
 * tokens get a transport-level 401 challenge instead of a tool error.
 */
const authenticateOAuthBearer = async ({
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
		throw invalidTokenError({
			message: "Invalid or expired OAuth access token",
			resourceUrl,
		});
	}

	// RFC 8707 audience binding: this resource server only accepts tokens minted for it.
	if (
		!oauthAudienceAllowsResource({
			grantResource: accessToken.resource,
			resourceUrl,
		})
	) {
		throw invalidTokenError({
			message: "OAuth access token was not issued for this resource",
			resourceUrl,
		});
	}

	return {
		orgId: accessToken.referenceId,
		userId: accessToken.userId,
		// Only the resource scopes gate tools; OIDC protocol scopes are dropped.
		scopes: getRequestedOAuthResourceScopes(accessToken.scopes),
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
		const identity = await authenticateOAuthBearer({
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
		throw new OAuthHttpError(
			401,
			"Invalid OAuth token prefix",
			"invalid_token",
			getInvalidTokenChallenge(resourceUrl),
		);
	}

	if (flags["oauth-enabled"]) {
		throw new OAuthHttpError(
			401,
			"Missing Autumn API key bearer token",
			"invalid_token",
			getInvalidTokenChallenge(resourceUrl),
		);
	}

	logger.warning("Missing secret-key for MCP request");
	throw new OAuthHttpError(401, "Missing secret-key", "invalid_token");
};

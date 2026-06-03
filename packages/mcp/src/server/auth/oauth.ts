import { ms } from "@autumn/shared/unixUtils";
import { addMilliseconds, isFuture } from "date-fns";
import type { ConsoleLogger } from "../../console-logger.js";
import { MCP_OAUTH_SCOPES } from "../../constants.js";
import type { AutumnMcpAuth } from "./auth.js";
import { OAuthHttpError } from "./utils/errors.js";
import { getOAuthPrincipalId, principalFromSecret } from "./utils/principal.js";
import {
	getEnvironment,
	getStaticApiKey,
	parseRequestOption,
} from "./utils/request.js";
import {
	failOpenSchema,
	type MCPOAuthFlags,
	secretKeySchema,
	tokenExchangeSchema,
	xApiVersionSchema,
} from "./utils/schemas.js";
import {
	getApiKeyUrl,
	getIssuerUrl,
	getResourceUrl,
	getWWWAuthenticate,
} from "./utils/urls.js";

// Public surface consumed via `./oauth.js` (index.ts, leaf, tests).
export { MCP_OAUTH_SCOPES } from "../../constants.js";
export { OAuthHttpError } from "./utils/errors.js";
export type { MCPOAuthFlags, OAuthEnvironment } from "./utils/schemas.js";

type ExchangedToken = {
	key: string;
	orgId?: string | undefined;
	userId?: string | undefined;
	clientId?: string | undefined;
	scopes?: string[] | undefined;
};

const apiKeyCache = new Map<string, ExchangedToken & { expiresAt: Date }>();

const exchangeOAuthToken = async ({
	headers,
	flags,
	resource,
	token,
}: {
	headers: Headers;
	flags: MCPOAuthFlags;
	resource: string;
	token: string;
}): Promise<ExchangedToken> => {
	const env = getEnvironment({ headers, flags });
	const cacheKey = `${token}:${resource}:${env}`;
	const cached = apiKeyCache.get(cacheKey);
	if (cached && isFuture(cached.expiresAt)) return cached;

	const response = await fetch(getApiKeyUrl(flags), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ resource, scopes: MCP_OAUTH_SCOPES }),
	});

	if (!response.ok) {
		throw new OAuthHttpError(
			response.status === 403 ? 403 : 401,
			await response.text(),
			response.status === 403 ? "insufficient_scope" : "invalid_token",
			response.status === 403
				? undefined
				: getWWWAuthenticate({ resourceUrl: resource, error: "invalid_token" }),
		);
	}

	const data = tokenExchangeSchema.parse(await response.json());
	const key = env === "live" ? data.prod_key : data.sandbox_key;
	if (!key) {
		throw new OAuthHttpError(
			502,
			"OAuth key exchange did not return an API key",
		);
	}

	const exchanged = {
		key,
		orgId: data.org_id,
		userId: data.user_id,
		clientId: data.client_id,
		scopes: data.scopes,
		expiresAt: addMilliseconds(new Date(), ms.minutes(1)),
	};
	apiKeyCache.set(cacheKey, exchanged);
	return exchanged;
};

export const getProtectedResourceMetadata = (
	headers: Headers,
	flags: MCPOAuthFlags,
	resourcePath = "/mcp",
) => ({
	resource: getResourceUrl({ headers, resourcePath }),
	authorization_servers: [getIssuerUrl(flags)],
	scopes_supported: [...MCP_OAUTH_SCOPES],
	bearer_methods_supported: ["header"],
	resource_name: "Autumn MCP",
});

export const getAuthorizationServerMetadata = (flags: MCPOAuthFlags) => {
	const issuer = getIssuerUrl(flags);
	return {
		issuer,
		authorization_endpoint: `${issuer}/oauth2/authorize`,
		token_endpoint: `${issuer}/oauth2/token`,
		registration_endpoint: `${issuer}/oauth2/register`,
		revocation_endpoint: `${issuer}/oauth2/revoke`,
		introspection_endpoint: `${issuer}/oauth2/introspect`,
		response_types_supported: ["code"],
		grant_types_supported: ["authorization_code", "refresh_token"],
		token_endpoint_auth_methods_supported: [
			"client_secret_post",
			"client_secret_basic",
			"none",
		],
		code_challenge_methods_supported: ["S256"],
		scopes_supported: [...MCP_OAUTH_SCOPES],
	};
};

export const buildAuthForRequest = async (
	headers: Headers,
	flags: MCPOAuthFlags,
	logger: ConsoleLogger,
	resourcePath = "/mcp",
): Promise<AutumnMcpAuth> => {
	const env = getEnvironment({ headers, flags });
	const resource = getResourceUrl({ headers, resourcePath });
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
			env,
			resource,
			principalId: principalFromSecret({ kind: "secret-key", value: apiKey }),
			scopes: [...MCP_OAUTH_SCOPES],
			serverURL: flags["server-url"],
			xApiVersion,
			failOpen,
		};
	}

	if (flags["oauth-enabled"]) {
		const authHeader = headers.get("authorization");
		if (!authHeader?.startsWith("Bearer ")) {
			throw new OAuthHttpError(
				401,
				"Missing Authorization bearer token",
				"invalid_token",
				getWWWAuthenticate({ resourceUrl: resource }),
			);
		}

		const token = authHeader.slice("Bearer ".length);
		const exchanged = await exchangeOAuthToken({
			headers,
			flags,
			resource,
			token,
		});
		return {
			apiKey: exchanged.key,
			env,
			resource,
			principalId: getOAuthPrincipalId({ token, exchanged }),
			scopes: exchanged.scopes ?? [...MCP_OAUTH_SCOPES],
			orgId: exchanged.orgId,
			serverURL: flags["server-url"],
			xApiVersion,
			failOpen,
		};
	}

	logger.warning("Missing secret-key for MCP request");
	throw new OAuthHttpError(401, "Missing secret-key", "invalid_token");
};

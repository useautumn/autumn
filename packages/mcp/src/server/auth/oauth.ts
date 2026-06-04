import { MCP_OAUTH_SCOPES } from "../../constants.js";
import type { AutumnMcpAuth } from "./auth.js";
import { OAuthHttpError } from "./utils/errors.js";
import { principalFromSecret } from "./utils/principal.js";
import {
	getEnvironment,
	getStaticApiKey,
	parseRequestOption,
} from "./utils/request.js";
import {
	failOpenSchema,
	type MCPOAuthFlags,
	secretKeySchema,
	xApiVersionSchema,
} from "./utils/schemas.js";
import {
	getIssuerUrl,
	getResourceUrl,
	getWWWAuthenticate,
} from "./utils/urls.js";

// Public surface consumed via `./oauth.js` (index.ts, leaf, tests).
export { MCP_OAUTH_SCOPES } from "../../constants.js";
export { OAuthHttpError } from "./utils/errors.js";
export type { MCPOAuthFlags, OAuthEnvironment } from "./utils/schemas.js";

type AuthLogger = {
	warning: (message: string, data?: Record<string, unknown>) => void;
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
	logger: AuthLogger,
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
		throw new OAuthHttpError(
			401,
			"Missing Autumn API key bearer token",
			"invalid_token",
			getWWWAuthenticate({ resourceUrl: resource, error: "invalid_token" }),
		);
	}

	logger.warning("Missing secret-key for MCP request");
	throw new OAuthHttpError(401, "Missing secret-key", "invalid_token");
};

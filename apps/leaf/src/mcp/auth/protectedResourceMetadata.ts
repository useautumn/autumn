import { getOAuthIssuerUrl } from "@autumn/auth/oauth";
import { DEFAULT_AUTUMN_API_URL } from "@autumn/mcp";
import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";

export class OAuthHttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly error = "invalid_token",
		readonly wwwAuthenticate?: string,
	) {
		super(message);
	}
}

export const getProtectedResourceMetadata = ({
	resourceUrl,
	serverURL,
}: {
	resourceUrl: string;
	serverURL?: string;
}) => ({
	resource: resourceUrl,
	authorization_servers: [
		getOAuthIssuerUrl({ baseUrl: serverURL ?? DEFAULT_AUTUMN_API_URL }),
	],
	// Spec-faithful MCP clients request only the scopes advertised here. Include
	// offline_access so one-hour access tokens can be renewed without re-consent.
	scopes_supported: [...DEFAULT_OAUTH_RESOURCE_SCOPES, "offline_access"],
	bearer_methods_supported: ["header"],
	resource_name: "Autumn MCP",
});

import {
	getOAuthIssuerUrl,
} from "@autumn/auth/oauth";
import {
	DEFAULT_AUTUMN_API_URL,
	MCP_OAUTH_SCOPES,
} from "@autumn/mcp";

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
	scopes_supported: [...MCP_OAUTH_SCOPES],
	bearer_methods_supported: ["header"],
	resource_name: "Autumn MCP",
});

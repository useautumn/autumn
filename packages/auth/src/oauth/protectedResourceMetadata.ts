import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";
import { getOAuthIssuerUrl } from "./oauthUrls.js";

export const getProtectedResourceMetadata = ({
	issuerBaseUrl,
	resourceName,
	resourceUrl,
}: {
	issuerBaseUrl: string;
	resourceName: string;
	resourceUrl: string;
}) => ({
	resource: resourceUrl,
	authorization_servers: [getOAuthIssuerUrl({ baseUrl: issuerBaseUrl })],
	// RFC 9728 `scopes_supported` lists scopes that request access to THIS
	// resource, so `offline_access` stays out. The authorization server still
	// advertises it, and `getMcpAuthorizeScopes` adds it to an MCP client's
	// /authorize request so a metadata-following client still gets a refresh token.
	scopes_supported: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
	bearer_methods_supported: ["header"],
	resource_name: resourceName,
});

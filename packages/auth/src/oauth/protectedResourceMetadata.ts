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
	scopes_supported: [...DEFAULT_OAUTH_RESOURCE_SCOPES, "offline_access"],
	bearer_methods_supported: ["header"],
	resource_name: resourceName,
});

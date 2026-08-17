import {
	getOAuthStringField,
	parseOAuthRequestFields,
} from "@autumn/shared/utils/auth/oauthRequestBody";
import {
	AUTUMN_ADMIN_OAUTH_CLIENT_ID,
	SUMMER_OAUTH_CLIENT_ID,
} from "./reservedOAuthClients.js";

export const UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND = "chat_unrestricted";

/** Admin and Summer tokens stay opaque OAuth tokens instead of api keys. */
export const returnsOAuthAccessTokenForClientId = ({
	clientId,
}: {
	clientId: string;
}) =>
	clientId === AUTUMN_ADMIN_OAUTH_CLIENT_ID ||
	clientId === SUMMER_OAUTH_CLIENT_ID;

export const isMcpOAuthResource = (resource: string | null | undefined) => {
	if (!resource || !URL.canParse(resource)) return false;
	return new URL(resource).pathname.replace(/\/+$/, "").endsWith("/mcp");
};

export const getResourceFromOAuthTokenRequest = async (request: Request) => {
	const { fields, searchParams } = await parseOAuthRequestFields(request);
	if (searchParams) return searchParams.getAll("resource")[0] ?? null;

	const resource = fields.resource;
	return getOAuthStringField(Array.isArray(resource) ? resource[0] : resource);
};

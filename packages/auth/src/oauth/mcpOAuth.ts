import {
	MCP_CLIENT_KIND,
	parseOAuthClientMetadata,
} from "@autumn/shared/utils/auth/oauthClientMetadata";
import {
	getOAuthStringField,
	parseOAuthRequestFields,
} from "@autumn/shared/utils/auth/oauthRequestBody";
import {
	AUTUMN_ADMIN_OAUTH_CLIENT_ID,
	clientIdsFromEnv,
	SUMMER_OAUTH_CLIENT_ID,
} from "./reservedOAuthClients.js";

export const UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND = "chat_unrestricted";

// Legacy rows persisted the internal-mcp kind; dynamic registration now writes mcp_client.
const MCP_OAUTH_CLIENT_KINDS: readonly string[] = [
	MCP_CLIENT_KIND,
	"internal_mcp",
];

export const isReservedMcpOAuthClientId = ({
	clientId,
}: {
	clientId: string | null | undefined;
}) =>
	!!clientId &&
	clientIdsFromEnv("INTERNAL_MCP_OAUTH_CLIENT_ID").includes(clientId);

export const isMcpOAuthClientRecord = ({
	clientId,
	metadata,
}: {
	clientId: string | null | undefined;
	metadata?: unknown;
}) => {
	if (isReservedMcpOAuthClientId({ clientId })) return true;
	return MCP_OAUTH_CLIENT_KINDS.includes(
		parseOAuthClientMetadata(metadata).kind ?? "",
	);
};

/** Admin and Summer tokens stay opaque OAuth tokens instead of api keys. */
export const returnsOAuthAccessTokenForClientId = ({
	clientId,
}: {
	clientId: string;
}) =>
	clientId === AUTUMN_ADMIN_OAUTH_CLIENT_ID ||
	clientId === SUMMER_OAUTH_CLIENT_ID;

export const getResourceFromOAuthTokenRequest = async (request: Request) => {
	const { fields, isJson, rawBody } = await parseOAuthRequestFields(request);
	// RFC 8707 lets a request repeat `resource`; the first one wins, and the
	// parsed fields only keep the last, so read the form body directly.
	if (!isJson) {
		return getOAuthStringField(
			new URLSearchParams(rawBody).getAll("resource")[0],
		);
	}

	const resource = fields.resource;
	return getOAuthStringField(Array.isArray(resource) ? resource[0] : resource);
};

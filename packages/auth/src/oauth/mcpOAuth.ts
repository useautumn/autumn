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
	SUMMER_OAUTH_CLIENT_ID,
} from "./reservedOAuthClients.js";

export const UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND = "chat_unrestricted";

// Legacy rows persisted the internal-mcp kind; dynamic registration now writes mcp_client.
const MCP_OAUTH_CLIENT_KINDS: readonly string[] = [
	MCP_CLIENT_KIND,
	"internal_mcp",
];

const internalMcpOAuthClientIds = () =>
	(process.env.INTERNAL_MCP_OAUTH_CLIENT_ID ?? "")
		.split(",")
		.map((clientId) => clientId.trim())
		.filter(Boolean);

export const isMcpOAuthClient = ({
	clientId,
}: {
	clientId: string | null | undefined;
}) => !!clientId && internalMcpOAuthClientIds().includes(clientId);

export const isMcpOAuthClientRecord = ({
	clientId,
	metadata,
}: {
	clientId: string | null | undefined;
	metadata?: unknown;
}) => {
	if (isMcpOAuthClient({ clientId })) return true;
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
	const { fields, searchParams } = await parseOAuthRequestFields(request);
	if (searchParams) return searchParams.getAll("resource")[0] ?? null;

	const resource = fields.resource;
	return getOAuthStringField(Array.isArray(resource) ? resource[0] : resource);
};

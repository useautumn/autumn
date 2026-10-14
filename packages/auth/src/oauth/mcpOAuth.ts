import {
	MCP_CLIENT_KIND,
	parseOAuthClientMetadata,
} from "@autumn/shared/utils/auth/oauthClientMetadata";
import {
	asNonEmptyString,
	type ParsedOAuthRequest,
} from "@autumn/shared/utils/auth/oauthRequestBody";
import {
	AUTUMN_ADMIN_OAUTH_CLIENT_ID,
	internalMcpOAuthClientIds,
	SUMMER_OAUTH_CLIENT_ID,
} from "./reservedOAuthClients.js";

export const UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND = "chat_unrestricted";

export const isUnrestrictedChatOAuthConsent = ({
	metadata,
}: {
	metadata: unknown;
}) => {
	if (typeof metadata !== "object" || metadata === null) return false;
	return (
		"kind" in metadata && metadata.kind === UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND
	);
};

const MCP_OAUTH_CLIENT_KINDS: readonly string[] = [
	MCP_CLIENT_KIND,
	"internal_mcp",
];

export const isReservedMcpOAuthClientId = ({
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
	if (isReservedMcpOAuthClientId({ clientId })) return true;
	return MCP_OAUTH_CLIENT_KINDS.includes(
		parseOAuthClientMetadata(metadata).kind ?? "",
	);
};

export const returnsOAuthAccessTokenForClientId = ({
	clientId,
}: {
	clientId: string;
}) =>
	clientId === AUTUMN_ADMIN_OAUTH_CLIENT_ID ||
	clientId === SUMMER_OAUTH_CLIENT_ID;

export const getResourceFromOAuthTokenRequest = ({
	fields,
	isJson,
	rawBody,
}: ParsedOAuthRequest) => {
	// RFC 8707 lets a request repeat `resource`; the first one wins, and the
	if (!isJson) {
		return asNonEmptyString(new URLSearchParams(rawBody).getAll("resource")[0]);
	}

	const resource = fields.resource;
	return asNonEmptyString(Array.isArray(resource) ? resource[0] : resource);
};

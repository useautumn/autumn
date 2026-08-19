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

/**
 * A scope-less grant bypasses every route scope check, so it is only legitimate
 * when Leaf's unrestricted chat consent backs it. Both resource servers re-check
 * this, because the mint-time check cannot vouch for a row written years ago.
 */
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

// Legacy rows persisted the internal-mcp kind; dynamic registration now writes mcp_client.
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

/** Admin and Summer tokens stay opaque OAuth tokens instead of api keys. */
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
	// parsed fields only keep the last, so read the form body directly.
	if (!isJson) {
		return asNonEmptyString(new URLSearchParams(rawBody).getAll("resource")[0]);
	}

	const resource = fields.resource;
	return asNonEmptyString(Array.isArray(resource) ? resource[0] : resource);
};

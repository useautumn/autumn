import { isMcpClientMetadata } from "@autumn/shared/utils/auth/oauthClientMetadata";
import {
	getOAuthStringField,
	parseOAuthRequestFields,
} from "@autumn/shared/utils/auth/oauthRequestBody";

export const UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND = "chat_unrestricted";
export const SLACK_MCP_OAUTH_CLIENT_ID = "autumn_mcp_slack";
export const WEB_MCP_OAUTH_CLIENT_ID = "autumn_mcp_web";
export const AUTUMN_ADMIN_OAUTH_CLIENT_ID = "autumn_admin";
export const SUMMER_OAUTH_CLIENT_ID = "autumn_summer";

export const MCP_OAUTH_CLIENTS = [
	{ type: "claude", name: "Claude", clientId: "autumn_mcp_claude" },
	{ type: "codex", name: "Codex", clientId: "autumn_mcp_codex" },
	{ type: "cursor", name: "Cursor", clientId: "autumn_mcp_cursor" },
	{ type: "opencode", name: "OpenCode", clientId: "autumn_mcp_opencode" },
	{ type: "slack", name: "Slack", clientId: SLACK_MCP_OAUTH_CLIENT_ID },
] as const;

export type KnownMpcClientType = (typeof MCP_OAUTH_CLIENTS)[number]["type"];
export type MpcClientType = KnownMpcClientType | "dynamic";
export type MpcClientInfo = {
	type: MpcClientType;
	name: string;
	clientId: string;
};

export const MCP_OAUTH_CLIENT_IDS = MCP_OAUTH_CLIENTS.map(
	(client) => client.clientId,
);

export const isKnownMcpOAuthClientId = ({
	clientId,
}: {
	clientId: string | null | undefined;
}) =>
	!!clientId && (MCP_OAUTH_CLIENT_IDS as readonly string[]).includes(clientId);

export const isMcpOAuthClientRecord = ({
	clientId,
	metadata,
}: {
	clientId: string | null | undefined;
	metadata?: unknown;
}) => isKnownMcpOAuthClientId({ clientId }) || isMcpClientMetadata(metadata);

export const returnsOAuthAccessTokenForClientId = ({
	clientId,
}: {
	clientId: string;
}) =>
	isKnownMcpOAuthClientId({ clientId }) ||
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

export const MCP_CLIENT_KIND = "mcp_client";
export const SLACK_MCP_OAUTH_CLIENT_ID = "autumn_mcp_slack";
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

const parseMetadata = (metadata: unknown) => {
	if (!metadata) return {};
	if (typeof metadata === "string") {
		try {
			const parsed = JSON.parse(metadata);
			return parsed && typeof parsed === "object" ? parsed : {};
		} catch {
			return {};
		}
	}

	return typeof metadata === "object" ? metadata : {};
};

export const isMcpOAuthClientRecord = ({
	clientId,
	metadata,
}: {
	clientId: string | null | undefined;
	metadata?: unknown;
}) => {
	if (isKnownMcpOAuthClientId({ clientId })) return true;
	const parsedMetadata = parseMetadata(metadata);
	return parsedMetadata.kind === MCP_CLIENT_KIND;
};

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
	const contentType = request.headers.get("content-type") ?? "";
	const rawBody = await request.text();
	if (!rawBody) return null;

	if (contentType.includes("application/json")) {
		try {
			const body = JSON.parse(rawBody) as Record<string, unknown>;
			const resource = body.resource;
			if (Array.isArray(resource)) return getString(resource[0]);
			return getString(resource);
		} catch {
			return null;
		}
	}

	const params = new URLSearchParams(rawBody);
	return params.getAll("resource")[0] ?? null;
};

const getString = (value: unknown) =>
	typeof value === "string" && value.length > 0 ? value : null;

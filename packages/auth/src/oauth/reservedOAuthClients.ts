export const AUTUMN_ADMIN_OAUTH_CLIENT_ID = "autumn_admin";
export const SUMMER_OAUTH_CLIENT_ID = "autumn_summer";
export const SLACK_MCP_OAUTH_CLIENT_ID = "autumn_mcp_slack";
export const WEB_MCP_OAUTH_CLIENT_ID = "autumn_mcp_web";

export const RESERVED_OAUTH_CLIENT_NAMES: ReadonlySet<string> = new Set([
	"atmn",
	"autumn cli",
	"autumn internal-mcp",
	"summer",
]);

const clientIdsByRawValue = new Map<string, readonly string[]>();

export const clientIdsFromEnv = (variable: string): readonly string[] => {
	const rawValue = process.env[variable] ?? "";
	const cached = clientIdsByRawValue.get(rawValue);
	if (cached) return cached;

	const clientIds = rawValue
		.split(",")
		.map((clientId) => clientId.trim())
		.filter(Boolean);
	clientIdsByRawValue.set(rawValue, clientIds);
	return clientIds;
};

export const internalMcpOAuthClientIds = (): readonly string[] => {
	const clientIds = clientIdsFromEnv("INTERNAL_MCP_OAUTH_CLIENT_IDS");
	return clientIds.length > 0
		? clientIds
		: clientIdsFromEnv("INTERNAL_MCP_OAUTH_CLIENT_ID");
};

export const isReservedOAuthClientName = (clientName: string) =>
	RESERVED_OAUTH_CLIENT_NAMES.has(clientName.trim().toLowerCase());

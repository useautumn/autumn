export const AUTUMN_ADMIN_OAUTH_CLIENT_ID = "autumn_admin";
export const SUMMER_OAUTH_CLIENT_ID = "autumn_summer";
export const SLACK_MCP_OAUTH_CLIENT_ID = "autumn_mcp_slack";
export const WEB_MCP_OAUTH_CLIENT_ID = "autumn_mcp_web";

/** Display names owned by first-party clients; dynamic registration may not claim them. */
export const RESERVED_OAUTH_CLIENT_NAMES: ReadonlySet<string> = new Set([
	"atmn",
	"autumn cli",
	"autumn internal-mcp",
	"summer",
]);

// Keyed by the raw value, not the variable name, so a changed env still parses
// while a stable one is split and allocated once instead of per auth call.
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

/**
 * The variable holds a comma-separated list, so its name is plural now; the
 * singular one is still read so a deployment can be renamed without downtime.
 */
export const internalMcpOAuthClientIds = (): readonly string[] => {
	const clientIds = clientIdsFromEnv("INTERNAL_MCP_OAUTH_CLIENT_IDS");
	return clientIds.length > 0
		? clientIds
		: clientIdsFromEnv("INTERNAL_MCP_OAUTH_CLIENT_ID");
};

export const isReservedOAuthClientName = (clientName: string) =>
	RESERVED_OAUTH_CLIENT_NAMES.has(clientName.trim().toLowerCase());

export const AUTUMN_ADMIN_OAUTH_CLIENT_ID = "autumn_admin";
export const SUMMER_OAUTH_CLIENT_ID = "autumn_summer";
export const SLACK_MCP_OAUTH_CLIENT_ID = "autumn_mcp_slack";
export const WEB_MCP_OAUTH_CLIENT_ID = "autumn_mcp_web";

const STATIC_RESERVED_OAUTH_CLIENT_IDS: readonly string[] = [
	AUTUMN_ADMIN_OAUTH_CLIENT_ID,
	SUMMER_OAUTH_CLIENT_ID,
	SLACK_MCP_OAUTH_CLIENT_ID,
	WEB_MCP_OAUTH_CLIENT_ID,
];

/** Display names owned by first-party clients; dynamic registration may not claim them. */
export const RESERVED_OAUTH_CLIENT_NAMES: ReadonlySet<string> = new Set([
	"atmn",
	"autumn cli",
	"autumn internal-mcp",
	"summer",
]);

const clientIdsFromEnv = (variable: string) =>
	(process.env[variable] ?? "")
		.split(",")
		.map((clientId) => clientId.trim())
		.filter(Boolean);

export const isReservedOAuthClientId = (clientId: string) =>
	STATIC_RESERVED_OAUTH_CLIENT_IDS.includes(clientId) ||
	clientIdsFromEnv("ATMN_OAUTH_CLIENT_IDS").includes(clientId) ||
	clientIdsFromEnv("INTERNAL_MCP_OAUTH_CLIENT_ID").includes(clientId);

export const isReservedOAuthClientName = (clientName: string) =>
	RESERVED_OAUTH_CLIENT_NAMES.has(clientName.trim().toLowerCase());

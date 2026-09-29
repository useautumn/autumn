export const SLACK_USERS_READ_SCOPE = "users:read";
export const SLACK_EMAIL_SCOPE = "users:read.email";

export const DEFAULT_SLACK_BOT_SCOPES: readonly string[] = [
	"app_mentions:read",
	"assistant:write",
	"channels:history",
	"channels:read",
	"chat:write",
	"files:read",
	"groups:history",
	"groups:read",
	"im:history",
	"im:read",
	"im:write",
	"mpim:history",
	"mpim:read",
	SLACK_USERS_READ_SCOPE,
	SLACK_EMAIL_SCOPE,
];

/**
 * Extra bot scopes for the internal admin install only (Autumn's own
 * workspace), used to create per-org support channels and send Slack Connect
 * invites. Customer installs never request these.
 */
export const SLACK_CONNECT_ADMIN_SCOPES: readonly string[] = [
	"channels:manage",
	"channels:write.invites",
	"conversations.connect:write",
];

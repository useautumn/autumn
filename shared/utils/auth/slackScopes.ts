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
	"users:read",
	SLACK_EMAIL_SCOPE,
];

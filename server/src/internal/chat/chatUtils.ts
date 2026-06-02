import { ErrCode, RecaseError } from "@autumn/shared";

export const slackProvider = "slack" as const;

export const defaultSlackScopes = [
	"app_mentions:read",
	"assistant:write",
	"channels:history",
	"channels:read",
	"chat:write",
	"groups:history",
	"groups:read",
	"im:history",
	"im:read",
	"im:write",
	"mpim:history",
	"mpim:read",
	"users:read",
];

export const getMissingSlackScopes = (scopes: string[]) => {
	const granted = new Set(scopes);
	return defaultSlackScopes.filter((scope) => !granted.has(scope));
};

export const getRequiredChatEnv = (key: string) => {
	const value = process.env[key];
	if (value) return value;

	throw new RecaseError({
		message: `${key} is not configured`,
		code: ErrCode.InvalidRequest,
		statusCode: 500,
	});
};

export const getChatStateSecret = () =>
	process.env.CHAT_STATE_SECRET ??
	process.env.SLACK_STATE_SECRET ??
	process.env.BETTER_AUTH_SECRET ??
	getRequiredChatEnv("ENCRYPTION_PASSWORD");

export const createSlackInstallUrl = (state: string) => {
	const scope = process.env.SLACK_BOT_SCOPES ?? defaultSlackScopes.join(",");
	const params = new URLSearchParams({
		client_id: getRequiredChatEnv("SLACK_CLIENT_ID"),
		scope,
		state,
	});
	if (process.env.SLACK_REDIRECT_URI) {
		params.set("redirect_uri", process.env.SLACK_REDIRECT_URI);
	}
	return `https://slack.com/oauth/v2/authorize?${params}`;
};

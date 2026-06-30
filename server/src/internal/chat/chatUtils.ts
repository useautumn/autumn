import {
	DEFAULT_SLACK_BOT_SCOPES,
	ErrCode,
	RecaseError,
	SLACK_EMAIL_SCOPE,
} from "@autumn/shared";

export const slackProvider = "slack" as const;
export const slackAdminProviderPrefix = "slack_admin" as const;

export const getSlackAdminProvider = ({
	clientId = getRequiredChatEnv("SLACK_CLIENT_ID"),
}: {
	clientId?: string;
} = {}) => `${slackAdminProviderPrefix}:${clientId}` as const;

export const getMissingSlackScopes = (scopes: string[]) => {
	const granted = new Set(scopes);
	return DEFAULT_SLACK_BOT_SCOPES.filter((scope) => !granted.has(scope));
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
	const configured = process.env.SLACK_BOT_SCOPES
		? process.env.SLACK_BOT_SCOPES.split(",")
				.map((scope) => scope.trim())
				.filter(Boolean)
		: [...DEFAULT_SLACK_BOT_SCOPES];
	const scope = [...new Set([...configured, SLACK_EMAIL_SCOPE])].join(",");
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

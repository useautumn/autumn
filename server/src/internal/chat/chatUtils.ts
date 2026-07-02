import { ErrCode, RecaseError } from "@autumn/shared";
import {
	DEFAULT_SLACK_BOT_SCOPES,
	SLACK_EMAIL_SCOPE,
	SLACK_USERS_READ_SCOPE,
} from "@autumn/shared/utils/auth/slackScopes";

export const slackProvider = "slack" as const;
export const slackAdminProviderPrefix = "slack_admin" as const;

export const getSlackAdminProvider = ({
	clientId = getRequiredChatEnv("SLACK_CLIENT_ID"),
}: {
	clientId?: string;
} = {}) => `${slackAdminProviderPrefix}:${clientId}` as const;

/** Scopes that enable extra features but don't require a reconnect when absent. */
const OPTIONAL_SLACK_SCOPES: readonly string[] = [SLACK_EMAIL_SCOPE];

export const getMissingSlackScopes = (scopes: string[]) => {
	const granted = new Set(scopes);
	return DEFAULT_SLACK_BOT_SCOPES.filter(
		(scope) => !(OPTIONAL_SLACK_SCOPES.includes(scope) || granted.has(scope)),
	);
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

const parseSlackBotScopesEnv = (raw: string) => {
	const scopes = raw
		.split(",")
		.map((scope) => scope.trim())
		.filter(Boolean);
	if (scopes.length === 0) {
		throw new RecaseError({
			message: "SLACK_BOT_SCOPES is set but contains no valid scopes",
			code: ErrCode.InvalidRequest,
			statusCode: 500,
		});
	}
	return scopes;
};

export const createSlackInstallUrl = (state: string) => {
	const configured = process.env.SLACK_BOT_SCOPES
		? parseSlackBotScopesEnv(process.env.SLACK_BOT_SCOPES)
		: [...DEFAULT_SLACK_BOT_SCOPES];
	const scope = [
		...new Set([...configured, SLACK_USERS_READ_SCOPE, SLACK_EMAIL_SCOPE]),
	].join(",");
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

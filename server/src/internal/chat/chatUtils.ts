import crypto from "node:crypto";
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

/** Slack user resolution depends on these, even when SLACK_BOT_SCOPES overrides the defaults. */
const REQUIRED_USER_RESOLUTION_SCOPES: readonly string[] = [
	SLACK_USERS_READ_SCOPE,
	SLACK_EMAIL_SCOPE,
];

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

const getSlackBotScopes = () => {
	const base = process.env.SLACK_BOT_SCOPES
		? parseSlackBotScopesEnv(process.env.SLACK_BOT_SCOPES)
		: DEFAULT_SLACK_BOT_SCOPES;
	return [...new Set([...base, ...REQUIRED_USER_RESOLUTION_SCOPES])];
};

export const createSlackInstallUrl = (
	state: string,
	{ extraScopes = [] }: { extraScopes?: readonly string[] } = {},
) => {
	const params = new URLSearchParams({
		client_id: getRequiredChatEnv("SLACK_CLIENT_ID"),
		scope: [...new Set([...getSlackBotScopes(), ...extraScopes])].join(","),
		state,
	});
	if (process.env.SLACK_REDIRECT_URI) {
		params.set("redirect_uri", process.env.SLACK_REDIRECT_URI);
	}
	return `https://slack.com/oauth/v2/authorize?${params}`;
};

/** Decrypts chat tokens stored by leaf (`apps/leaf/src/lib/crypto.ts`). */
export const decryptChatToken = ({ token }: { token: string }) => {
	const key = crypto
		.createHash("sha256")
		.update(process.env.ENCRYPTION_PASSWORD ?? "")
		.digest();
	const buffer = Buffer.from(token, "base64");
	if (buffer[0] !== 1) throw new Error("Unsupported encrypted payload");
	const decipher = crypto.createDecipheriv(
		"aes-256-gcm",
		key,
		buffer.subarray(1, 13),
	);
	decipher.setAuthTag(buffer.subarray(13, 29));
	return Buffer.concat([
		decipher.update(buffer.subarray(29)),
		decipher.final(),
	]).toString("utf8");
};

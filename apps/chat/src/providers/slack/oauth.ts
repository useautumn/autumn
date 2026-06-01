import { z } from "zod";
import { env } from "../../lib/env.js";

const SLACK_OAUTH_URL = "https://slack.com/api/oauth.v2.access";

const slackOAuthBaseSchema = z
	.object({
		ok: z.boolean(),
		error: z.string().optional(),
	})
	.loose();

const slackOAuthSuccessSchema = z.object({
	access_token: z.string(),
	scope: z.string().optional(),
	bot_user_id: z.string().optional(),
	team: z.object({ id: z.string(), name: z.string() }),
	authed_user: z.object({ id: z.string() }).optional(),
});

export const exchangeSlackCode = async (code: string) => {
	const body = new URLSearchParams({
		client_id: env.SLACK_CLIENT_ID,
		client_secret: env.SLACK_CLIENT_SECRET,
		code,
	});
	if (env.SLACK_REDIRECT_URI) {
		body.set("redirect_uri", env.SLACK_REDIRECT_URI);
	}
	const response = await fetch(SLACK_OAUTH_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});
	const data = slackOAuthBaseSchema.parse(await response.json());
	if (!data.ok)
		throw new Error(`Slack OAuth failed: ${data.error ?? "unknown"}`);
	return slackOAuthSuccessSchema.parse(data);
};

export const slackSuccessUrl = () =>
	`${env.CLIENT_URL}/settings?tab=integrations&chat=connected`;

export const slackErrorUrl = (error: string) =>
	`${env.CLIENT_URL}/settings?tab=integrations&chat_error=${encodeURIComponent(error)}`;

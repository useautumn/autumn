import * as arctic from "arctic";
import type { Context } from "hono";
import { Hono } from "hono";
import { getEnv } from "@/config";
import { getRedis } from "@/lib/redis";
import { getWorkspace, saveWorkspace } from "@/services/workspace";

export const connectRoutes = new Hono();

type StatePayload = {
	workspaceId: string;
	userId: string;
	codeVerifier: string;
};

type ApiKeysResponse = {
	prod_key?: string;
	org_id?: string;
	org_name?: string;
	error?: string;
};

const STATE_PREFIX = "autumn:oauth:state:";

function getClient(): arctic.OAuth2Client {
	const env = getEnv();
	return new arctic.OAuth2Client(
		env.AUTUMN_OAUTH_CLIENT_ID,
		env.AUTUMN_OAUTH_CLIENT_SECRET,
		`${env.BASE_URL}/slack/callback`,
	);
}

export function renderHtml(title: string, message: string): string {
	return `
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body style="font-family: system-ui; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f7f5; color: #171717;">
  <main style="max-width: 560px; padding: 24px; text-align: center; background: white; border: 1px solid #e7e5e4; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.04);">
    <h1 style="margin: 0 0 12px; font-size: 24px;">${title}</h1>
    <p style="margin: 0; line-height: 1.5;">${message}</p>
  </main>
</body>
</html>
`;
}

connectRoutes.get("/", async (c) => {
	const env = getEnv();
	const workspaceId = c.req.query("workspace_id")?.trim();
	const userId = c.req.query("user_id")?.trim();

	if (!workspaceId || !userId) {
		return c.html(
			renderHtml(
				"Missing Parameters",
				"Expected workspace_id and user_id in the URL, run /connect from Slack again.",
			),
			400,
		);
	}

	const client = getClient();
	const state = arctic.generateState();
	const codeVerifier = arctic.generateCodeVerifier();
	const authorizeUrl = client.createAuthorizationURLWithPKCE(
		`${env.AUTUMN_BACKEND_URL}/api/auth/oauth2/authorize`,
		state,
		arctic.CodeChallengeMethod.S256,
		codeVerifier,
		[],
	);
	authorizeUrl.searchParams.set("prompt", "consent");

	const payload: StatePayload = { workspaceId, userId, codeVerifier };
	await getRedis().setex(`${STATE_PREFIX}${state}`, 10 * 60, JSON.stringify(payload));

	return c.redirect(authorizeUrl.toString());
});

export async function handleAutumnOAuthCallback(c: Context) {
	const env = getEnv();
	const code = c.req.query("code");
	const state = c.req.query("state");
	const oauthError = c.req.query("error");
	const errorDesc = c.req.query("error_description");

	if (oauthError) {
		return c.html(renderHtml("Authorization Failed", errorDesc || oauthError), 400);
	}

	if (!code || !state) {
		return c.html(
			renderHtml("Invalid Callback", "Missing code or state, run /connect again."),
			400,
		);
	}

	const redis = getRedis();
	const raw = await redis.get(`${STATE_PREFIX}${state}`);
	await redis.del(`${STATE_PREFIX}${state}`);

	if (!raw) {
		return c.html(renderHtml("Session Expired", "This session expired, run /connect again."), 400);
	}

	let payload: StatePayload;
	try {
		payload = JSON.parse(raw) as StatePayload;
	} catch {
		return c.html(
			renderHtml("Invalid Session", "Could not read the session, run /connect again."),
			400,
		);
	}

	try {
		const client = getClient();
		const tokens = await client.validateAuthorizationCode(
			`${env.AUTUMN_BACKEND_URL}/api/auth/oauth2/token`,
			code,
			payload.codeVerifier,
		);

		const apiKeysRes = await fetch(`${env.AUTUMN_BACKEND_URL}/cli/api-keys`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${tokens.accessToken()}`,
				"Content-Type": "application/json",
			},
		});

		if (!apiKeysRes.ok) {
			const err = (await apiKeysRes.json().catch(() => ({}))) as ApiKeysResponse;
			return c.html(
				renderHtml(
					"Key Provisioning Failed",
					err.error || "OAuth succeeded but key provisioning failed.",
				),
				400,
			);
		}

		const apiKeys = (await apiKeysRes.json()) as ApiKeysResponse;

		if (!apiKeys.prod_key || !apiKeys.org_id) {
			return c.html(
				renderHtml("Incomplete Response", "Autumn returned an incomplete key payload, try again."),
				400,
			);
		}

		const existing = await getWorkspace(payload.workspaceId);
		const orgName = apiKeys.org_name || existing?.orgName || apiKeys.org_id;

		await saveWorkspace({
			workspaceId: payload.workspaceId,
			apiKey: apiKeys.prod_key,
			orgSlug: apiKeys.org_id,
			orgName,
			commandChannels: existing?.commandChannels || [],
			alertChannel: existing?.alertChannel || null,
			slackBotToken: existing?.slackBotToken || null,
			webhookSecret: existing?.webhookSecret || null,
			installedAt: existing?.installedAt || Date.now(),
			installedBotUserId: existing?.installedBotUserId || null,
			connectedByUserId: payload.userId,
		});

		console.log(`Workspace connected: ${orgName}`);

		return c.html(
			renderHtml(
				"Autumn Connected",
				"Autumn is now connected, return to Slack and mention @Autumn to get started.",
			),
			200,
		);
	} catch (err) {
		if (err instanceof arctic.OAuth2RequestError) {
			console.error(`Autumn OAuth failed: ${err.code}`);
			return c.html(renderHtml("Authorization Failed", `OAuth error: ${err.code}`), 400);
		}
		console.error("Autumn OAuth failed:", err);
		return c.html(
			renderHtml("Connection Failed", "Something went wrong connecting to Autumn, try again."),
			500,
		);
	}
}

import { Hono } from "hono";
import { slackAdapter } from "@/bot";
import { getEnv } from "@/config";
import { handleAutumnOAuthCallback, renderHtml } from "@/routes/connect";
import { getWorkspace, saveWorkspace } from "@/services/workspace";

export const installRoutes = new Hono();

installRoutes.get("/slack", (c) => {
	const env = getEnv();
	const clientId = env.SLACK_CLIENT_ID;

	if (!clientId) {
		return c.text("SLACK_CLIENT_ID not configured", 500);
	}

	const scopes = [
		// Messaging
		"chat:write",
		"commands",
		// Assistant
		"assistant:write",
		// Channel access
		"app_mentions:read",
		"channels:history",
		"channels:read",
		"groups:history",
		"groups:read",
		// DMs
		"im:history",
		"im:read",
		"im:write",
		"mpim:history",
		"mpim:read",
		// Users
		"users:read",
	].join(",");

	const url = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}`;

	return c.redirect(url);
});

installRoutes.get("/slack/callback", async (c) => {
	if (c.req.query("state")) {
		return handleAutumnOAuthCallback(c);
	}

	try {
		const { teamId, installation } = await slackAdapter.handleOAuthCallback(c.req.raw);

		const existing = await getWorkspace(teamId);
		await saveWorkspace({
			workspaceId: teamId,
			apiKey: existing?.apiKey || null,
			orgSlug: existing?.orgSlug || "",
			orgName: existing?.orgName || installation.teamName || "",
			commandChannels: existing?.commandChannels || [],
			alertChannel: existing?.alertChannel || null,
			slackBotToken: installation.botToken || null,
			webhookSecret: existing?.webhookSecret || null,
			installedAt: existing?.installedAt || Date.now(),
			installedBotUserId: installation.botUserId || existing?.installedBotUserId || null,
			connectedByUserId: existing?.connectedByUserId || null,
		});

		console.log(`Slack bot installed: ${installation.teamName} (${teamId})`);

		return c.html(
			renderHtml("Autumn installed!", "Head back to Slack and run /connect to finish setup."),
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const isInvalidCode = message.includes("invalid_code");
		console.error(`Slack OAuth failed: ${isInvalidCode ? "invalid_code" : message}`);
		return c.html(
			renderHtml(
				"Installation failed",
				isInvalidCode
					? "The authorization code expired or was already used, try installing again."
					: "Something went wrong during installation, try again from /slack.",
			),
			400,
		);
	}
});

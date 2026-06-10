import { type ChatProvider, verifyChatInstallState } from "@autumn/shared";
import { Hono } from "hono";
import { z } from "zod";
import { bot } from "../../bot.js";
import { logger } from "../../lib/logger.js";
import { getStateSecret, replaceInstallation } from "./installations.js";
import { exchangeSlackCode, slackErrorUrl, slackSuccessUrl } from "./oauth.js";

const callbackQuery = z.strictObject({
	code: z.string(),
	state: z.string(),
});

const isSlackInstallProvider = (provider: string): provider is ChatProvider =>
	provider === "slack" ||
	provider === "slack_admin" ||
	provider.startsWith("slack_admin:");

export const slackRoutes = new Hono();

slackRoutes.get("/oauth/callback", async (c) => {
	try {
		const { code, state } = callbackQuery.parse({
			code: c.req.query("code"),
			state: c.req.query("state"),
		});

		const parsedState = verifyChatInstallState(state, getStateSecret());
		if (!parsedState || !isSlackInstallProvider(parsedState.provider))
			throw new Error("Invalid or expired Slack OAuth state");

		const oauth = await exchangeSlackCode(code);
		await replaceInstallation({
			state: parsedState,
			provider: parsedState.provider,
			workspaceId: oauth.team.id,
			workspaceName: oauth.team.name,
			botUserId: oauth.bot_user_id,
			botAccessToken: oauth.access_token,
			scopes: String(oauth.scope ?? "")
				.split(",")
				.filter(Boolean),
			installedByProviderUserId: oauth.authed_user?.id,
		});
		logger.info("[chat:slack] Installed", {
			event: "leaf.slack_installed",
			context: {
				org_id: parsedState.orgId,
				slack_workspace_id: oauth.team.id,
			},
			data: {
				workspace_name: oauth.team.name,
			},
		});

		return c.redirect(slackSuccessUrl());
	} catch (error) {
		logger.error("[chat:slack] OAuth callback failed", error, {
			event: "leaf.slack_oauth_failed",
		});
		return c.redirect(slackErrorUrl("Slack install failed"));
	}
});

slackRoutes.post("/events", (c) => {
	logger.debug("Received Slack events request", {
		event: "leaf.slack_events_request_received",
	});
	if (!bot.webhooks.slack) return c.text("Slack is not configured", 503);
	return bot.webhooks.slack(c.req.raw);
});

slackRoutes.post("/interactions", (c) => {
	logger.debug("Received Slack interactions request", {
		event: "leaf.slack_interactions_request_received",
	});
	if (!bot.webhooks.slack) return c.text("Slack is not configured", 503);
	return bot.webhooks.slack(c.req.raw);
});

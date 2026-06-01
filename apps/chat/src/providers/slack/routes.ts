import { verifyChatInstallState } from "@autumn/shared/utils/chatState";
import { Hono } from "hono";
import { z } from "zod";
import { bot } from "../../bot.js";
import { getStateSecret, replaceInstallation } from "./installations.js";
import { exchangeSlackCode, slackErrorUrl, slackSuccessUrl } from "./oauth.js";

const callbackQuery = z.strictObject({
	code: z.string(),
	state: z.string(),
});

export const slackRoutes = new Hono();

slackRoutes.get("/oauth/callback", async (c) => {
	try {
		const { code, state } = callbackQuery.parse({
			code: c.req.query("code"),
			state: c.req.query("state"),
		});

		const parsedState = verifyChatInstallState(state, getStateSecret());
		if (!parsedState || parsedState.provider !== "slack")
			throw new Error("Invalid or expired Slack OAuth state");

		const oauth = await exchangeSlackCode(code);
		await replaceInstallation({
			state: parsedState,
			provider: "slack",
			workspaceId: oauth.team.id,
			workspaceName: oauth.team.name,
			botUserId: oauth.bot_user_id,
			botAccessToken: oauth.access_token,
			scopes: String(oauth.scope ?? "")
				.split(",")
				.filter(Boolean),
			installedByProviderUserId: oauth.authed_user?.id,
		});
		console.info("[chat:slack] Installed", {
			orgId: parsedState.orgId,
			workspaceId: oauth.team.id,
			workspaceName: oauth.team.name,
		});

		return c.redirect(slackSuccessUrl());
	} catch (error) {
		console.error("[chat:slack] OAuth callback failed", error);
		return c.redirect(
			slackErrorUrl(
				error instanceof Error ? error.message : "Slack install failed",
			),
		);
	}
});

slackRoutes.post("/events", (c) => {
	if (!bot.webhooks.slack) return c.text("Slack is not configured", 503);
	return bot.webhooks.slack(c.req.raw);
});

slackRoutes.post("/interactions", (c) => {
	if (!bot.webhooks.slack) return c.text("Slack is not configured", 503);
	return bot.webhooks.slack(c.req.raw);
});

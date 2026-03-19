import { createSlackAdapter } from "@chat-adapter/slack";
import { createRedisState } from "@chat-adapter/state-redis";
import { Chat } from "chat";
import { handleCancelAction, handleConfirmAction } from "@/agent/confirm";
import { handleAgentMention, handleAgentMessage } from "@/agent/handler";
import { handleSlashCommandByName } from "@/commands/router";
import { getEnv } from "@/config";
import { getWorkspace } from "@/services/workspace";

const env = getEnv();

export const slackAdapter = createSlackAdapter({
	clientId: env.SLACK_CLIENT_ID,
	clientSecret: env.SLACK_CLIENT_SECRET,
});

// Patch missing Slack envelope fields onto inner events for App Home + Slack Connect.
const adapter = slackAdapter as unknown as Record<string, unknown>;

const origProcess = adapter.processEventPayload as (
	payload: Record<string, unknown>,
	options?: unknown,
) => void;

adapter.processEventPayload = function (payload: Record<string, unknown>, options?: unknown) {
	if (payload.type === "event_callback" && payload.event) {
		const event = payload.event as Record<string, unknown>;
		if (event.type === "app_home_opened" && !event.team_id && payload.team_id) {
			event.team_id = payload.team_id;
		}
		if (!event.authorizations && payload.authorizations) {
			event.authorizations = payload.authorizations;
		}
	}
	return origProcess.call(this, payload, options);
};

const origHandleHome = adapter.handleAppHomeOpened as (
	event: Record<string, unknown>,
	options?: unknown,
) => void;

let appHomeTeamId: string | null = null;

adapter.handleAppHomeOpened = function (event: Record<string, unknown>, options?: unknown) {
	appHomeTeamId = (event.team_id as string) || null;
	return origHandleHome.call(this, event, options);
};

export const bot = new Chat({
	userName: "autumn",
	logger: "warn",
	adapters: { slack: slackAdapter },
	state: createRedisState(),
});

bot.onSlashCommand(async (event) => {
	await handleSlashCommandByName(event);
});

bot.onNewMention(async (thread, message) => {
	await handleAgentMention(thread, message);
});

bot.onSubscribedMessage(async (thread, message) => {
	await handleAgentMessage(thread, message);
});

bot.onAction(["confirm", "confirm_invoice"], async (event) => {
	await handleConfirmAction(event);
});

bot.onAction("cancel", async (event) => {
	await handleCancelAction(event);
});

bot.onAssistantThreadStarted(async (event) => {
	try {
		await slackAdapter.setSuggestedPrompts(event.channelId, event.threadTs, [
			{ title: "Customer lookup", message: "What plan is customer acme on?" },
			{ title: "Usage check", message: "Show me usage for customer acme" },
			{ title: "Attach a plan", message: "Attach the Pro plan to customer acme" },
		]);
	} catch (err) {
		console.error("assistant_thread_started error:", err);
	}
});

bot.onAppHomeOpened(async (event) => {
	try {
		const workspaceId = appHomeTeamId;
		appHomeTeamId = null;
		const workspace = workspaceId ? await getWorkspace(workspaceId) : null;
		const slack = bot.getAdapter("slack");

		const blocks: Record<string, unknown>[] = [];

		if (workspace?.orgName) {
			blocks.push(
				{ type: "header", text: { type: "plain_text", text: "Autumn" } },
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `*Connected to:* ${workspace.orgName}`,
					},
				},
				{ type: "divider" },
			);
		} else {
			blocks.push(
				{ type: "header", text: { type: "plain_text", text: "Autumn" } },
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: "Not connected yet. Run `/connect` in any channel to get started.",
					},
				},
				{ type: "divider" },
			);
		}

		blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text: '*Getting Started*\nMention `@Autumn` in any channel to ask about customers, subscriptions, usage, and billing.\n\nExamples:\n- "What plan is acme on?"\n- "Grant acme 5000 messages"\n- "Show upcoming renewals"',
			},
		});

		await slack.publishHomeView(event.userId, { type: "home", blocks });
	} catch (err) {
		console.error("app_home_opened error:", err);
	}
});

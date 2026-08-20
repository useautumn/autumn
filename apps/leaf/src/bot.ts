import { verifyDashboardSession } from "@autumn/auth";
import { createSlackAdapter } from "@chat-adapter/slack";
import { verifySlackSignature } from "@chat-adapter/slack/webhook";
import { createPostgresState } from "@chat-adapter/state-pg";
import { createWebAdapter } from "@chat-adapter/web";
import { Chat } from "chat";
import { handleApprovalAction } from "./internal/approvals/surfaces/slack/decide.js";
import {
	handleEditApprovalDetailsAction,
	handleEditApprovalDetailsSubmit,
} from "./internal/approvals/surfaces/slack/editDetails.js";
import { ensureWebChatAuth } from "./internal/installations/actions/ensureWebChatAuth.js";
import { handleStopAction } from "./internal/runs/handleStopAction.js";
import { decrypt } from "./lib/crypto.js";
import { env } from "./lib/env.js";
import { logger as rootLogger } from "./lib/logger.js";
import {
	getSlackEventWorkspaceId,
	normalizeSlackEventsBody,
} from "./providers/slack/events.js";
import { handleSlackCatalogDecision } from "./providers/slack/handlers/handleSlackCatalogDecision.js";
import {
	handleSlackMessage,
	handleSlackThreadStart,
	handleSubscribedSlackMessage,
} from "./providers/slack/handlers/handleSlackMessage.js";
import { handleSlackQuestionAnswer } from "./providers/slack/handlers/handleSlackQuestionAnswer.js";
import { handleSlackSlashCommand } from "./providers/slack/handlers/handleSlackSlashCommand.js";
import { findSlackInstallationForWorkspace } from "./providers/slack/installations.js";
import {
	catalogDecisionActionIds,
	questionAnswerActionIds,
} from "./providers/slack/presenters/interactionCards.js";
import {
	EDIT_APPROVAL_DETAILS_ACTION_ID,
	EDIT_APPROVAL_DETAILS_MODAL_ID,
} from "./ui/blocks.js";

export const chatAdapterNames = ["slack", "web"];

export const bot = new Chat({
	userName: env.CHAT_NAME,
	adapters: {
		slack: createSlackAdapter({
			clientId: env.SLACK_CLIENT_ID,
			clientSecret: env.SLACK_CLIENT_SECRET,
			installationProvider: {
				getInstallation: async (workspaceId) => {
					const installation = await findSlackInstallationForWorkspace({
						workspaceId,
					});
					if (!installation) return null;
					return {
						botToken: decrypt(installation.bot_access_token),
						botUserId: installation.bot_user_id ?? undefined,
						teamName: installation.workspace_name,
					};
				},
			},
			webhookVerifier: async (request, body) => {
				await verifySlackSignature(body, request.headers, {
					signingSecret: env.SLACK_SIGNING_SECRET,
				});
				const workspaceId = getSlackEventWorkspaceId(body);
				const installation = workspaceId
					? await findSlackInstallationForWorkspace({ workspaceId })
					: null;
				return normalizeSlackEventsBody({
					body,
					botUserId: installation?.bot_user_id,
				});
			},
			userName: env.CHAT_NAME,
		}),
		web: createWebAdapter({
			userName: env.CHAT_NAME,
			getUser: async (request) => {
				const session = await verifyDashboardSession({
					cookie: request.headers.get("cookie"),
					authBaseUrl: env.AUTUMN_API_URL,
				});
				rootLogger.info("Web chat getUser", {
					event: "leaf.web_chat_get_user",
					data: {
						hasCookie: Boolean(request.headers.get("cookie")),
						authenticated: Boolean(session?.userId),
						hasOrg: Boolean(session?.activeOrganizationId),
					},
				});
				if (!session?.activeOrganizationId) return null;
				await ensureWebChatAuth({
					orgId: session.activeOrganizationId,
					userId: session.userId,
					userScopes: session.scopes,
				});
				return { id: `${session.userId}~${session.activeOrganizationId}` };
			},
		}),
	},
	state: createPostgresState({
		keyPrefix: "chat",
		url: env.CHAT_STATE_DATABASE_URL,
	}),
	concurrency: "concurrent",
});

bot.onDirectMessage(handleSlackMessage);
bot.onNewMention(async (thread, message) => {
	await thread.subscribe();
	await handleSlackThreadStart(thread, message);
});
bot.onSubscribedMessage(handleSubscribedSlackMessage);
bot.onSlashCommand(handleSlackSlashCommand);
bot.onAction(
	["approve_billing_action", "cancel_billing_action"],
	handleApprovalAction,
);
bot.onAction(questionAnswerActionIds, handleSlackQuestionAnswer);
bot.onAction(catalogDecisionActionIds, handleSlackCatalogDecision);
bot.onAction(
	[EDIT_APPROVAL_DETAILS_ACTION_ID],
	handleEditApprovalDetailsAction,
);
bot.onModalSubmit(
	[EDIT_APPROVAL_DETAILS_MODAL_ID],
	handleEditApprovalDetailsSubmit,
);
bot.onAction(["stop_agent_run"], handleStopAction);
bot.registerSingleton();

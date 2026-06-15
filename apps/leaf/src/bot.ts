import { createSlackAdapter } from "@chat-adapter/slack";
import { createPostgresState } from "@chat-adapter/state-pg";
import type { Attachment, Message, Thread } from "chat";
import { Chat } from "chat";
import { runMessage } from "./agent/runMessage/runMessage.js";
import { handleApprovalAction } from "./internal/approvals/actions/handleApprovalAction.js";
import { postApprovalRequest } from "./internal/approvals/actions/postApprovalRequest.js";
import { decrypt } from "./lib/crypto.js";
import { env } from "./lib/env.js";
import {
	addLeafContext,
	createLeafSessionContext,
	logger as rootLogger,
} from "./lib/logger.js";
import { getSlackWorkspaceId } from "./providers/slack/context.js";
import {
	fetchSlackAttachmentFallback,
	getSlackFilesFromRaw,
} from "./providers/slack/files.js";
import { findInstallationWithOrg } from "./providers/slack/installations.js";
import { getRecentMessages } from "./providers/slack/threadContext.js";
import type { ChatContextMessage } from "./types.js";
import {
	createActionLogger,
	finishLoading,
	type LoadingState,
	type ReplyTarget,
	startLoading,
} from "./ui/progress.js";

export const chatAdapterNames = ["slack"];

const getSlackAdminProvider = () =>
	`slack_admin:${env.SLACK_CLIENT_ID}` as const;

const findSlackInstallationForWorkspace = async ({
	workspaceId,
}: {
	workspaceId: string;
}) => {
	return (
		(await findInstallationWithOrg(getSlackAdminProvider(), workspaceId)) ??
		(await findInstallationWithOrg("slack", workspaceId))
	);
};

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
			signingSecret: env.SLACK_SIGNING_SECRET,
			userName: env.CHAT_NAME,
		}),
	},
	state: createPostgresState({
		keyPrefix: "chat",
		url: env.CHAT_STATE_DATABASE_URL,
	}),
	concurrency: "queue",
});

const runAndReply = async ({
	channelId,
	attachments,
	providerUserId,
	raw,
	recentMessages,
	target,
	text,
	threadId,
}: {
	attachments?: Attachment[];
	channelId: string;
	providerUserId: string;
	raw: unknown;
	recentMessages?: ChatContextMessage[];
	target: ReplyTarget;
	text: string;
	threadId: string;
}) => {
	let loading: LoadingState = null;
	let logger = rootLogger;
	try {
		const workspaceId = getSlackWorkspaceId(raw);
		const installation = await findSlackInstallationForWorkspace({
			workspaceId,
		});
		if (!installation) {
			logger.warn("Slack installation not found", {
				event: "leaf.slack_installation_missing",
			});
			return;
		}

		const session = createLeafSessionContext({
			channelId,
			provider: installation.provider,
			providerUserId,
			threadId,
			workspaceId,
		});
		logger = addLeafContext(rootLogger, {
			...session.context,
			agent_run_id: session.agentRunId,
			org_id: installation.org_id,
			org_slug: installation.org_slug,
		});
		logger.info("Received Slack message", {
			event: "leaf.slack_message_received",
			data: {
				attachment_count: attachments?.length ?? 0,
				text_length: text.length,
			},
		});
		if (!text.trim() && !attachments?.length) {
			logger.info("Skipping empty Slack message", {
				event: "leaf.slack_message_skipped",
				data: { reason: "empty" },
			});
			return;
		}

		loading = await startLoading(target);
		const logAction = createActionLogger(loading);
		const rawFiles = getSlackFilesFromRaw({ raw });
		const botToken = decrypt(installation.bot_access_token);
		const output = await runMessage({
			agentRunId: session.agentRunId,
			attachmentFetchFallback: ({ attachment }) =>
				fetchSlackAttachmentFallback({
					attachment,
					botToken,
					rawFiles,
				}),
			attachments,
			installation,
			logger,
			onAction: logAction,
			recentMessages,
			text,
			channelId,
			threadId,
		});

		const postedApproval = await postApprovalRequest({
			channelId,
			installation,
			loading,
			logAction,
			logger,
			output,
			providerUserId,
			target,
		});
		if (postedApproval) return;

		await finishLoading(target, loading, "Done.");
		await target.post({ markdown: output.text || "Done." });
		logger.info("Posted Slack response", {
			event: "leaf.slack_response_posted",
			data: {
				has_text: Boolean(output.text),
			},
		});
	} catch (error) {
		logger.error("[chat] Message failed", error, {
			event: "leaf.slack_message_failed",
		});
		await finishLoading(target, loading, "Request failed.");
		await target.post({
			markdown: "I could not complete that request. Please try again.",
		});
	}
};

const handleMessage = async (thread: Thread, message: Message) => {
	// Never respond to other bots (including a second Autumn app on the same
	// workspace) — otherwise two bots reply to each other in an infinite loop.
	if (message.author.isBot === true) {
		rootLogger.info("Skipping bot-authored Slack message", {
			event: "leaf.slack_message_skipped",
			data: { reason: "bot_author" },
		});
		return;
	}
	await runAndReply({
		target: thread,
		attachments: message.attachments,
		raw: message.raw,
		text: message.text,
		channelId: thread.channelId,
		providerUserId: message.author.userId,
		threadId: thread.id,
		recentMessages: await getRecentMessages(thread, message),
	});
};

bot.onDirectMessage(handleMessage);

bot.onNewMention(async (thread, message) => {
	await thread.subscribe();
	await handleMessage(thread, message);
});

bot.onSubscribedMessage(handleMessage);

bot.onSlashCommand(async (event) => {
	await runAndReply({
		target: event.channel,
		raw: event.raw,
		text: event.text || event.command,
		channelId: event.channel.id,
		providerUserId: event.user.userId,
		threadId: event.channel.id,
	});
});

bot.onAction(
	["approve_billing_action", "cancel_billing_action"],
	handleApprovalAction,
);

bot.registerSingleton();

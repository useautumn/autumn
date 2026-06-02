import { createSlackAdapter } from "@chat-adapter/slack";
import { createPostgresState } from "@chat-adapter/state-pg";
import type { Message, Thread } from "chat";
import { Chat } from "chat";
import { handleApprovalAction, postApprovalRequest } from "./approvals/flow.js";
import { getSlackWorkspaceId } from "./providers/slack/context.js";
import { decrypt } from "./lib/crypto.js";
import { env } from "./lib/env.js";
import { findInstallation } from "./providers/slack/installations.js";
import { runMessage } from "./agent/messages.js";
import {
	createActionLogger,
	finishLoading,
	type ReplyTarget,
	startLoading,
} from "./ui/progress.js";
import { getRecentMessages } from "./providers/slack/threadContext.js";
import type { ChatContextMessage } from "./types.js";

export const chatAdapterNames = ["slack"];

export const bot = new Chat({
	userName: env.CHAT_NAME,
	adapters: {
		slack: createSlackAdapter({
			clientId: env.SLACK_CLIENT_ID,
			clientSecret: env.SLACK_CLIENT_SECRET,
			installationProvider: {
				getInstallation: async (workspaceId) => {
					const installation = await findInstallation("slack", workspaceId);
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
	providerUserId,
	raw,
	recentMessages,
	target,
	text,
	threadId,
}: {
	channelId: string;
	providerUserId: string;
	raw: unknown;
	recentMessages?: ChatContextMessage[];
	target: ReplyTarget;
	text: string;
	threadId: string;
}) => {
	const workspaceId = getSlackWorkspaceId(raw);
	const installation = await findInstallation("slack", workspaceId);
	if (!installation || !text.trim()) return;

	const loading = await startLoading(target);
	const logAction = createActionLogger(loading);
	try {
		const output = await runMessage({
			installation,
			onAction: logAction,
			recentMessages,
			text,
			threadId,
		});

		const postedApproval = await postApprovalRequest({
			channelId,
			installation,
			loading,
			logAction,
			output,
			providerUserId,
			target,
		});
		if (postedApproval) return;

		await finishLoading(target, loading, "Done.");
		await target.post({ markdown: output.text || "Done." });
	} catch (error) {
		console.error("[chat] Message failed", error);
		await finishLoading(target, loading, "Request failed.");
		await target.post({
			markdown: "I could not complete that request. Please try again.",
		});
	}
};

const handleMessage = async (thread: Thread, message: Message) => {
	await runAndReply({
		target: thread,
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

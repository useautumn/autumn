import type { Message, Thread } from "chat";
import { logger as rootLogger } from "../../../lib/logger.js";
import { dispatchSlackAgentMessage } from "../actions/dispatchSlackAgentMessage.js";
import { getRecentMessages } from "../threadContext.js";

export const handleSlackMessage = async (thread: Thread, message: Message) => {
	if (message.author.isBot === true) {
		rootLogger.info("Skipping bot-authored Slack message", {
			event: "leaf.slack_message_skipped",
			data: { reason: "bot_author" },
		});
		return;
	}
	thread.adapter.addReaction(thread.id, message.id, "eyes").catch(() => {});
	await dispatchSlackAgentMessage({
		attachments: message.attachments,
		channelId: thread.channelId,
		providerUserId: message.author.userId,
		raw: message.raw,
		react: async ({ action, emoji }) => {
			if (action === "add") {
				await thread.adapter.addReaction(thread.id, message.id, emoji);
			} else {
				await thread.adapter.removeReaction(thread.id, message.id, emoji);
			}
		},
		recentMessages: () => getRecentMessages(thread, message),
		target: thread,
		text: message.text,
		threadId: thread.id,
	});
};

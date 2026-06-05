import type { Message, Thread } from "chat";
import type { ChatContextMessage } from "../../types.js";

export const getRecentMessages = async (
	thread: Thread,
	currentMessage: Message,
): Promise<ChatContextMessage[]> => {
	try {
		await thread.refresh();
	} catch (error) {
		console.warn("[chat] Could not refresh thread context", error);
	}

	const seen = new Set<string>();
	return [...thread.recentMessages, currentMessage]
		.filter((message) => {
			if (seen.has(message.id) || !message.text.trim()) return false;
			seen.add(message.id);
			return true;
		})
		.slice(-8)
		.map((message) => ({
			author:
				message.author.fullName ||
				message.author.userName ||
				message.author.userId,
			isBot: message.author.isBot,
			text: message.text,
		}));
};

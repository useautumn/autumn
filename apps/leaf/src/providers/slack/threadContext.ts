import type { Message, Thread } from "chat";
import type { AgentContextMessage } from "../../internal/agentRuntime/domain/agentTurnContext.js";
import { logger } from "../../lib/logger.js";

const isPlanBlock = (block: unknown) =>
	typeof block === "object" &&
	block !== null &&
	"type" in block &&
	block.type === "plan";

const isPlanMessage = ({ raw }: Message) =>
	typeof raw === "object" &&
	raw !== null &&
	"blocks" in raw &&
	Array.isArray(raw.blocks) &&
	raw.blocks.some(isPlanBlock);

export const getRecentMessages = async (
	thread: Thread,
	currentMessage: Message,
): Promise<AgentContextMessage[]> => {
	try {
		await thread.refresh();
	} catch (error) {
		logger.warn("Could not refresh thread context", {
			data: { error },
			event: "leaf.slack_thread_context_refresh_failed",
		});
	}

	const seen = new Set<string>();
	return [...thread.recentMessages, currentMessage]
		.filter((message) => {
			if (
				seen.has(message.id) ||
				!message.text.trim() ||
				isPlanMessage(message)
			)
				return false;
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

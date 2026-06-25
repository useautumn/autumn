import { leafSystemPrompt } from "@autumn/agent-docs/agent";
import type { AppEnv } from "@autumn/shared";
import type { ChatContextMessage } from "../../types.js";

/**
 * Single source for agent system prompts. The Mastra engine omits thread and
 * recentMessages (it passes those as context messages); Claude Code includes them.
 */
export const buildSystemPrompt = ({
	docsText,
	env,
	recentMessages,
	thread,
}: {
	docsText: string;
	env: AppEnv;
	recentMessages?: ChatContextMessage[];
	thread?: { provider: string; resourceId: string; threadId: string };
}) =>
	[
		leafSystemPrompt(thread?.provider === "slack" ? "slack" : "dashboard"),
		`Current Autumn environment: ${env}.`,
		thread
			? `${thread.provider} thread: ${thread.threadId}. Autumn resource: ${thread.resourceId}.`
			: null,
		thread
			? "Answer the latest user message. Use prior thread messages only as context."
			: null,
		recentMessages?.length
			? `Recent thread messages:\n${recentMessages
					.map(
						(message) =>
							`${message.author}${message.isBot === true ? " (bot)" : ""}: ${message.text}`,
					)
					.join("\n")}`
			: null,
		docsText,
	]
		.filter((section): section is string => Boolean(section))
		.join("\n\n");

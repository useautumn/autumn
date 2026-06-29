import { leafSkillsText, leafSystemPrompt } from "@autumn/agent-docs/agent";
import type { AppEnv } from "@autumn/shared";
import type { ChatContextMessage } from "../../types.js";

/**
 * Mastra/Claude-Code system prompt: leaf instructions + the knowledge skills
 * inlined (mastra has no native skill loading). Claude Code includes thread +
 * recentMessages; the Mastra engine passes those as context messages instead.
 */
export const buildSystemPrompt = ({
	env,
	inlineSkills = true,
	recentMessages,
	thread,
}: {
	env: AppEnv;
	/** Inline all skill text into the prompt. Off for engines that read skills on
	 * demand (mastra via the `readAutumnDoc` tool) to keep context lean. */
	inlineSkills?: boolean;
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
		inlineSkills ? leafSkillsText() : null,
	]
		.filter((section): section is string => Boolean(section))
		.join("\n\n");

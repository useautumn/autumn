import type { AutumnLogger } from "@autumn/logging";
import { AppEnv } from "@autumn/shared";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { DEFAULT_CHAT_ENV_MODEL } from "../../../lib/chatAgentConfig.js";
import { logger as rootLogger } from "../../../lib/logger.js";
import type { ChatContextMessage } from "../../../types.js";

const envSelectionSchema = z.strictObject({
	env: z.nativeEnum(AppEnv),
});

export const getDefaultChatEnv = () =>
	process.env.NODE_ENV === "production" ? AppEnv.Live : AppEnv.Sandbox;

export const recentMessageContext = (messages: ChatContextMessage[] = []) =>
	messages.map((message) => ({
		role: message.isBot === true ? ("assistant" as const) : ("user" as const),
		content: `${message.author}${message.isBot === true ? " (bot)" : ""}: ${message.text}`,
	}));

export const selectChatEnv = async ({
	logger = rootLogger,
	message,
	recentMessages,
	select,
}: {
	logger?: AutumnLogger;
	message: string;
	recentMessages?: ChatContextMessage[];
	select?: () => Promise<unknown> | unknown;
}) => {
	if (select) {
		const env = envSelectionSchema.parse(await select()).env;
		logger.debug("Selected chat environment from override", {
			event: "leaf.chat_env_selected",
			context: { env },
			data: { source: "override" },
		});
		return env;
	}

	const agent = new Agent({
		id: "autumn-chat-env",
		name: "Autumn Chat Env",
		instructions: `Choose the Autumn environment for the latest user request. Default to ${getDefaultChatEnv()}. Use the other environment only when the user clearly asks for it.`,
		model: DEFAULT_CHAT_ENV_MODEL,
	});
	const output = await agent.generate(message, {
		maxSteps: 1,
		structuredOutput: {
			schema: envSelectionSchema,
			instructions: `Return ${getDefaultChatEnv()} unless the latest user request clearly asks to use the other environment.`,
		},
		context: [...recentMessageContext(recentMessages)],
	});
	logger.debug("Selected chat environment from model", {
		event: "leaf.chat_env_selected",
		context: { env: output.object.env },
		data: { source: "model" },
	});
	return output.object.env;
};

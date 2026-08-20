import type { AutumnLogger } from "@autumn/logging";
import { AppEnv } from "@autumn/shared";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import type { AgentContextMessage } from "../../../internal/agentRuntime/domain/agentTurnContext.js";
import { DEFAULT_CHAT_ENV_MODEL } from "../../../lib/chatAgentConfig.js";
import { logger as rootLogger } from "../../../lib/logger.js";
import {
	chatEnvSelectorInstructions,
	chatEnvSelectorOutputInstructions,
} from "../../../prompts/chatSelectorPrompts.js";

const envSelectionSchema = z.strictObject({
	env: z.nativeEnum(AppEnv),
});

export const getDefaultChatEnv = () =>
	process.env.NODE_ENV === "production" ? AppEnv.Live : AppEnv.Sandbox;

const ENV_SIGNAL_PATTERN =
	/\b(sandbox|live|prod|production|test env|environment)\b/i;

/** Only a message that plausibly names an environment needs the model; the
 * overwhelming default is the org's default env, decided synchronously. */
export const messageHasEnvSignal = (
	message: string,
	recentMessages: ReadonlyArray<AgentContextMessage> = [],
) =>
	ENV_SIGNAL_PATTERN.test(message) ||
	recentMessages.some((recent) => ENV_SIGNAL_PATTERN.test(recent.text));

export const recentMessageContext = (
	messages: ReadonlyArray<AgentContextMessage> = [],
) =>
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
	recentMessages?: ReadonlyArray<AgentContextMessage>;
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

	if (!messageHasEnvSignal(message, recentMessages)) {
		const env = getDefaultChatEnv();
		logger.debug("Selected chat environment from heuristic", {
			event: "leaf.chat_env_selected",
			context: { env },
			data: { source: "heuristic" },
		});
		return env;
	}

	const agent = new Agent({
		id: "autumn-chat-env",
		name: "Autumn Chat Env",
		instructions: chatEnvSelectorInstructions(getDefaultChatEnv()),
		model: DEFAULT_CHAT_ENV_MODEL,
	});
	const output = await agent.generate(message, {
		maxSteps: 1,
		structuredOutput: {
			schema: envSelectionSchema,
			instructions: chatEnvSelectorOutputInstructions(getDefaultChatEnv()),
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

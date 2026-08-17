import { anthropic } from "@ai-sdk/anthropic";
import type { AutumnLogger } from "@autumn/logging";
import { ms, withTimeout } from "@autumn/shared";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { AgentContextMessage } from "../../../internal/agentRuntime/domain/agentTurnContext.js";
import { DEFAULT_SLACK_ROUTER_MODEL } from "../../../lib/chatAgentConfig.js";
import { logger as rootLogger } from "../../../lib/logger.js";

const ROUTER_TIMEOUT_MS = ms.seconds(10);

const routingSchema = z.strictObject({
	disposition: z.enum(["respond", "ignore", "unsubscribe"]),
});

const instructions = `Classify the latest message in a Slack thread watched by Autumn Chat.

Choose exactly one disposition:
- respond: The message explicitly mentions Autumn Chat, continues or changes an Autumn billing, pricing, customer, plan, feature, or investigation request, answers the bot's question, or asks the bot for a new task.
- ignore: The message is only an acknowledgment or social closure, is unrelated, or is side conversation for another person or bot.
- unsubscribe: The message explicitly tells Autumn Chat or this bot to stop listening, leave the thread, or stop replying.

Rules:
- An explicit mention is respond unless the message explicitly asks the bot to stop.
- A message that both acknowledges and requests Autumn work is respond.
- Never unsubscribe merely because a message is unrelated.
- When ambiguous, ignore.`;

const applyMentionRouting = ({
	disposition,
	isMention,
}: {
	disposition: z.infer<typeof routingSchema>["disposition"];
	isMention: boolean;
}) => (isMention && disposition === "ignore" ? "respond" : disposition);

export const classifySubscribedMessage = async ({
	classify,
	isMention,
	logger = rootLogger,
	recentMessages,
	text,
}: {
	classify?: () => Promise<unknown> | unknown;
	isMention: boolean;
	logger?: AutumnLogger;
	recentMessages: ReadonlyArray<AgentContextMessage>;
	text: string;
}) => {
	try {
		const output = classify
			? await classify()
			: await withTimeout({
					fn: async () =>
						(
							await generateText({
								model: anthropic(DEFAULT_SLACK_ROUTER_MODEL),
								output: Output.object({ schema: routingSchema }),
								prompt: JSON.stringify({
									latestMessage: { isMention, text },
									recentMessages,
								}),
								system: instructions,
							})
						).output,
					timeoutMessage: "Slack message routing timed out",
					timeoutMs: ROUTER_TIMEOUT_MS,
				});
		const { disposition } = routingSchema.parse(output);
		const routedDisposition = applyMentionRouting({ disposition, isMention });
		logger.debug("Classified subscribed Slack message", {
			event: "leaf.slack_message_classified",
			data: { disposition: routedDisposition },
		});
		return routedDisposition;
	} catch (error) {
		logger.warn("Could not classify subscribed Slack message", error, {
			event: "leaf.slack_message_classification_failed",
		});
		return "ignore" as const;
	}
};

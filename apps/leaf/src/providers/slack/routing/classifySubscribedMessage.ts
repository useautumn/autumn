import { anthropic } from "@ai-sdk/anthropic";
import type { AutumnLogger } from "@autumn/logging";
import { ms, withTimeout } from "@autumn/shared";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { AgentContextMessage } from "../../../internal/agentRuntime/domain/agentTurnContext.js";
import { DEFAULT_SLACK_ROUTER_MODEL } from "../../../lib/chatAgentConfig.js";
import { logger as rootLogger } from "../../../lib/logger.js";
import { slackMessageRouterInstructions } from "../../../prompts/slackMessageRouterPrompt.js";

const ROUTER_TIMEOUT_MS = ms.seconds(10);

const routingSchema = z.strictObject({
	disposition: z.enum(["respond", "ignore"]),
});

const explicitOptOutPattern =
	/^(?:stop\s+(?:replying|responding|listening|watching)(?:\s+(?:to|in)\s+(?:this|the)\s+thread)?|(?:do not|don't|dont|never)\s+(?:reply|respond|listen|watch)(?:\s+(?:anymore|again))?|leave\s+(?:this|the)\s+thread|unsubscribe(?:\s+from\s+(?:this|the)\s+thread)?)(?:\s+(?:now|please))?[.!?]*$/i;

const isExplicitOptOut = (text: string) =>
	explicitOptOutPattern.test(
		text
			.trim()
			.replace(/^(?:hey|hi)\s+/i, "")
			.replace(
				/^(?:<@[^>]+>|@?autumn(?:\s+chat(?:\s+local)?)?|(?:this|the)\s+bot)[,:\s-]*/i,
				"",
			)
			.replace(
				/^(?:please\s+|(?:can|could|would)\s+you\s+(?:please\s+)?)/i,
				"",
			),
	);

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
	if (isExplicitOptOut(text)) {
		logger.debug("Classified subscribed Slack message", {
			event: "leaf.slack_message_classified",
			data: { disposition: "unsubscribe", source: "explicit_opt_out" },
		});
		return "unsubscribe" as const;
	}

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
								system: slackMessageRouterInstructions,
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

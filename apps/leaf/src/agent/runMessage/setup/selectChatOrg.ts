import type { AutumnLogger } from "@autumn/logging";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { DEFAULT_CHAT_ORG_MODEL } from "../../../lib/chatAgentConfig.js";
import { logger as rootLogger } from "../../../lib/logger.js";
import type { ChatContextMessage } from "../../../types.js";
import {
	chatOrgSelectorInstructions,
	chatOrgSelectorOutputInstructions,
} from "../../prompts/selectorPrompts.js";
import { recentMessageContext } from "./selectChatEnv.js";

const orgSelectionSchema = z.strictObject({
	org_identifier: z.string().min(1).nullable(),
});

export const selectChatOrg = async ({
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
		const identifier = orgSelectionSchema.parse(await select()).org_identifier;
		logger.debug("Selected chat organization from override", {
			event: "leaf.chat_org_selected",
			data: { source: "override", has_identifier: Boolean(identifier) },
		});
		return identifier;
	}

	const agent = new Agent({
		id: "autumn-chat-org",
		name: "Autumn Chat Org",
		instructions: chatOrgSelectorInstructions,
		model: DEFAULT_CHAT_ORG_MODEL,
	});
	const output = await agent.generate(message, {
		maxSteps: 1,
		structuredOutput: {
			schema: orgSelectionSchema,
			instructions: chatOrgSelectorOutputInstructions,
		},
		context: [...recentMessageContext(recentMessages)],
	});
	logger.debug("Selected chat organization from model", {
		event: "leaf.chat_org_selected",
		data: {
			source: "model",
			has_identifier: Boolean(output.object.org_identifier),
		},
	});
	return output.object.org_identifier;
};

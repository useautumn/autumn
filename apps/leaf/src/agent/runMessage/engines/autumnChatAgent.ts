import type { AppEnv } from "@autumn/shared";
import type { ToolsInput } from "@mastra/core/agent";
import { Agent } from "@mastra/core/agent";
import { leafChatAgentDefaults } from "../../../lib/chatAgentConfig.js";
import { buildSystemPrompt } from "../../prompts/buildSystemPrompt.js";

// Env-free module: the eval driver imports this without leaf's env schema.
export const createAutumnChatAgent = ({
	docsText,
	env,
	model = leafChatAgentDefaults.model,
	tools,
}: {
	docsText: string;
	env: AppEnv;
	model?: string;
	tools: ToolsInput;
}) =>
	new Agent({
		id: "autumn-chat",
		name: "Autumn Chat",
		instructions: buildSystemPrompt({ docsText, env }),
		model,
		tools,
	});

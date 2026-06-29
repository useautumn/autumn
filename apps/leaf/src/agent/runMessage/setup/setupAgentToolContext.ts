import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import {
	createAutumnMcpClient,
	getAutumnMcpTools,
} from "../../tools/autumnMcp.js";
import type { AgentToolContext } from "../types.js";

/** Resolve the agent's tool set + which tools are destructive. Knowledge no
 * longer rides here — it's the agent-docs skills inlined/attached in the prompt. */
export const setupAgentToolContext = async ({
	env,
	logger,
	token,
}: {
	env: AppEnv;
	logger: AutumnLogger;
	token: string;
}): Promise<AgentToolContext> => {
	const mcp = createAutumnMcpClient({ token, appEnv: env });
	try {
		const tools = await getAutumnMcpTools({ mcp, options: { logger } });
		const destructiveTools = new Set(
			Object.entries(tools)
				.filter(([, tool]) => tool.mcp?.annotations?.destructiveHint === true)
				.map(([name]) => name),
		);
		return { destructiveTools };
	} finally {
		await mcp.disconnect();
	}
};

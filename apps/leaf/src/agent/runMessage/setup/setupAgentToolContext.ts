import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { readDocs } from "../../prompts/readDocs.js";
import {
	createAutumnMcpClient,
	getAutumnMcpTools,
} from "../../tools/autumnMcp.js";
import type { AgentToolContext } from "../types.js";

/** One MCP metadata roundtrip per message, shared by every engine. */
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
		const [tools, docsText] = await Promise.all([
			getAutumnMcpTools({ mcp, options: { logger } }),
			readDocs({ mcp }),
		]);
		const destructiveTools = new Set(
			Object.entries(tools)
				.filter(([, tool]) => tool.mcp?.annotations?.destructiveHint === true)
				.map(([name]) => name),
		);
		return { destructiveTools, docsText };
	} finally {
		await mcp.disconnect();
	}
};

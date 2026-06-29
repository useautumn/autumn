import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { executeAutumnMcpTool } from "../../autumnMcp/client.js";
import { writeToPreviewTool } from "./toolRegistry.js";

// The agent may suspend on a write whose preview wasn't captured this run —
// backfill the money facts so the card never loses them.
export const fetchApprovalPreview = async ({
	env,
	executeTool = executeAutumnMcpTool,
	logger,
	request,
	token,
	toolName,
}: {
	env: AppEnv;
	executeTool?: typeof executeAutumnMcpTool;
	logger: Pick<AutumnLogger, "warn">;
	request: Record<string, unknown>;
	token: string;
	toolName: string;
}): Promise<unknown> => {
	const previewTool = writeToPreviewTool(toolName);
	if (!previewTool) return undefined;
	try {
		return await executeTool({
			env,
			token,
			toolName: previewTool,
			args: { request },
		});
	} catch (error) {
		logger.warn("Could not backfill approval preview", {
			event: "leaf.approval_preview_backfill_failed",
			tool: toolName,
			data: {
				error: error instanceof Error ? error.message : String(error),
			},
		});
		return undefined;
	}
};

import { GATED_WRITES } from "../../../../agent/lib/gatedWrites.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";

const writePreviewTools = new Map(
	GATED_WRITES.filter((write) => write.previewTool).map((write) => [
		write.toolName,
		write.previewTool as string,
	]),
);

const previewToolNames = new Set(writePreviewTools.values());

export const writeToPreviewTool = (toolName: string): string | undefined =>
	writePreviewTools.get(normalizeToolName(toolName));

export const isPreviewTool = (toolName: string): boolean =>
	previewToolNames.has(normalizeToolName(toolName));

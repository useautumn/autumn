import { GATED_WRITES } from "../../../../agent/lib/gatedWrites.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";

const writePreviewTools = new Map(
	GATED_WRITES.flatMap((write) =>
		write.previewTool ? [[write.toolName, write.previewTool] as const] : [],
	),
);

const previewToolNames = new Set(writePreviewTools.values());

const previewedRequestWrites = new Set(
	GATED_WRITES.flatMap((write) =>
		write.previewedRequestRequired ? [write.toolName] : [],
	),
);

export const writeToPreviewTool = (toolName: string): string | undefined =>
	writePreviewTools.get(normalizeToolName(toolName));

export const isPreviewTool = (toolName: string): boolean =>
	previewToolNames.has(normalizeToolName(toolName));

/** A write only accepted with a request the agent previewed verbatim. */
export const writeRequiresPreviewedRequest = (toolName: string): boolean =>
	previewedRequestWrites.has(normalizeToolName(toolName));

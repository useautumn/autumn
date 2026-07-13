import { normalizeToolName } from "../../../agent/tools/toolPolicy.js";

/** Single source for write tool → preview tool. A new approval-gated write only
 * needs an entry here (plus a `destructiveHint` on the MCP tool). */
const writePreviewTools: Record<string, string> = {
	attach: "previewAttach",
	createBalance: "previewCreateBalance",
	createSchedule: "previewCreateSchedule",
	updatePlan: "previewUpdateCatalog",
	updateCatalog: "previewUpdateCatalog",
	updateSubscription: "previewUpdateSubscription",
};

const previewToolNames = new Set(Object.values(writePreviewTools));

export const writeToPreviewTool = (toolName: string): string | undefined =>
	writePreviewTools[normalizeToolName(toolName)];

export const isPreviewTool = (toolName: string): boolean =>
	previewToolNames.has(normalizeToolName(toolName));

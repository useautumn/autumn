import {
	isToolErrorResult,
	normalizeToolName,
	toolLabel,
} from "../../../agent/tools/toolPolicy.js";
import { approvalErrorResult } from "./approvalErrors.js";

const STATUS_LINE_MAX_LENGTH = 120;

const toolStatusLines: Record<string, string> = {
	attach: "Attaching the plan…",
	createBalance: "Creating the balance…",
	createSchedule: "Creating the schedule…",
	previewAttach: "Re-checking pricing…",
	previewCreateSchedule: "Re-checking pricing…",
	previewUpdateSubscription: "Re-checking pricing…",
	updateSubscription: "Updating the subscription…",
};

export const toolStatusLine = (toolName: string) =>
	toolStatusLines[normalizeToolName(toolName)] ?? `${toolLabel(toolName)}…`;

export const errorStatusLine = (output: unknown) => {
	if (!isToolErrorResult(output)) return null;
	const message = approvalErrorResult(output).message;
	const truncated =
		message.length > STATUS_LINE_MAX_LENGTH
			? `${message.slice(0, STATUS_LINE_MAX_LENGTH - 1)}…`
			: message;
	return `Retrying — ${truncated}`;
};

export const formatElapsed = (startedAt: number) => {
	const seconds = Math.floor((Date.now() - startedAt) / 1000);
	if (seconds < 60) return `${seconds}s`;
	return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

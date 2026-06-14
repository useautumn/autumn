export const normalizeToolName = (toolName: string) =>
	toolName.replace(/^autumn_/, "");

const labels: Record<string, string> = {
	attach: "Attach plan",
	updateSubscription: "Update subscription",
	createSchedule: "Create schedule",
	createBalance: "Create balance",
	createPlan: "Create plan",
};

const previewWriteTools: Record<string, string> = {
	previewAttach: "attach",
	previewUpdateSubscription: "updateSubscription",
	previewCreateSchedule: "createSchedule",
	previewCreateBalance: "createBalance",
};

export const getWriteToolForPreview = (toolName: string) =>
	previewWriteTools[toolName.replace(/^autumn_/, "")];

// Pure utility tools the agent calls constantly — not worth a progress line.
const silentTools = new Set([
	"dateToEpochMilliseconds",
	"epochMillisecondsToDate",
]);

export const isSilentTool = (toolName: string) =>
	silentTools.has(normalizeToolName(toolName));

export const toolLabel = (toolName: string) =>
	labels[toolName.replace(/^autumn_/, "")] ??
	toolName
		.replace(/^autumn_/, "")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/^./, (char) => char.toUpperCase());

export type PreviewApproval = {
	preview: unknown;
	toolArgs: Record<string, unknown>;
	toolName: string;
};

export const isToolErrorResult = (output: unknown) => {
	if (!output || typeof output !== "object") return false;
	const result = output as {
		content?: Array<{ text?: string; type?: string }>;
		isError?: boolean;
	};
	if (result.isError === true) return true;
	return (
		result.content?.some(
			(item) =>
				typeof item.text === "string" &&
				item.text.includes("TOOL_EXECUTION_FAILED"),
		) ?? false
	);
};

/** Captures the latest preview-tool result as a write-tool approval candidate. */
export const createPreviewCapture = () => {
	const previewArgsByTool = new Map<string, Record<string, unknown>>();
	let captured: PreviewApproval | undefined;

	const capture = ({
		args,
		preview,
		toolName,
	}: {
		args: Record<string, unknown>;
		preview: unknown;
		toolName: string;
	}) => {
		const writeTool = getWriteToolForPreview(toolName);
		if (!writeTool) return;
		if (isToolErrorResult(preview)) return;
		captured = { preview, toolArgs: args, toolName: writeTool };
	};

	return {
		get captured() {
			return captured;
		},
		/** Mastra hook style: call + result available together. */
		captureFromExecution: capture,
		/** Event-stream style: record args on tool_call, capture on tool_result. */
		onToolCall: ({
			input,
			name,
		}: {
			input: Record<string, unknown>;
			name: string;
		}) => {
			if (getWriteToolForPreview(name)) previewArgsByTool.set(name, input);
		},
		onToolResult: ({ name, output }: { name: string; output: unknown }) => {
			const args = previewArgsByTool.get(name);
			if (args) capture({ args, preview: output, toolName: name });
		},
		/** A follow-up supersedes the turn's intent — its preview must not arm the write nudge. */
		reset: () => {
			captured = undefined;
			previewArgsByTool.clear();
		},
	};
};

export type PreviewCapture = ReturnType<typeof createPreviewCapture>;

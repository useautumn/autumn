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
	};
};

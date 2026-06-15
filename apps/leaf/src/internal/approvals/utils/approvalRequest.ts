import type { AgentOutput } from "../../../types.js";

const hasKeys = (value?: Record<string, unknown>) =>
	Boolean(value && Object.keys(value).length);

// The card renders from structured data only: tool args for the sentence and
// the captured preview-tool result for money facts. Agent prose is posted to
// the thread separately, never scraped into the card.
export const approvalRequestFromOutput = (output: AgentOutput) => {
	const previewApproval = output.previewApproval;

	if (output.finishReason === "suspended" && output.suspendPayload) {
		const suspended = output.suspendPayload;
		// Suspended ids can reference tool calls without local metadata; the
		// preview capture is the same write action, so backfill from it.
		const toolArgs = hasKeys(suspended.args)
			? (suspended.args as Record<string, unknown>)
			: (previewApproval?.toolArgs ?? {});
		const toolName =
			suspended.toolName === "unknown" && previewApproval
				? previewApproval.toolName
				: suspended.toolName;
		return {
			env: output.env,
			runId: output.runId,
			toolCallId: suspended.toolCallId,
			toolName,
			toolArgs,
			preview: previewApproval?.preview,
		};
	}

	if (previewApproval) {
		return {
			env: output.env,
			runId: output.runId,
			toolCallId: undefined,
			toolName: previewApproval.toolName,
			toolArgs: previewApproval.toolArgs,
			preview: previewApproval.preview,
		};
	}
};

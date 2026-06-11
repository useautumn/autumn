import type { AgentOutput } from "../../../types.js";

export const approvalRequestFromOutput = (output: AgentOutput) => {
	if (output.finishReason === "suspended" && output.suspendPayload) {
		return {
			env: output.env,
			runId: output.runId,
			toolCallId: output.suspendPayload.toolCallId,
			toolName: output.suspendPayload.toolName,
			toolArgs: output.suspendPayload.args ?? {},
			// Structured preview first: the card renders it as line items/fields,
			// falling back to the model's prose only when no payload was captured.
			preview:
				output.previewApproval?.preview ||
				output.text ||
				output.suspendPayload.args,
		};
	}

	if (output.previewApproval) {
		return {
			env: output.env,
			runId: output.runId,
			toolCallId: undefined,
			toolName: output.previewApproval.toolName,
			toolArgs: output.previewApproval.toolArgs,
			preview: output.previewApproval.preview || output.text,
		};
	}
};

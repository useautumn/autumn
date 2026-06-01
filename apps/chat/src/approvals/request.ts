import type { AgentOutput } from "../types.js";

export const approvalRequestFromOutput = (output: AgentOutput) => {
	if (output.finishReason === "suspended" && output.suspendPayload) {
		return {
			env: output.env,
			runId: output.runId,
			toolCallId: output.suspendPayload.toolCallId,
			toolName: output.suspendPayload.toolName,
			toolArgs: output.suspendPayload.args ?? {},
			preview: output.text || output.suspendPayload.args,
		};
	}

	if (output.previewApproval) {
		return {
			env: output.env,
			toolName: output.previewApproval.toolName,
			toolArgs: output.previewApproval.toolArgs,
			preview: output.text || output.previewApproval.preview,
		};
	}
};

import type { AgentOutput } from "../../../types.js";

// The card renders from structured data only: the suspended write's args for the
// sentence and its captured preview for money facts. Agent prose is posted to the
// thread separately, never scraped into the card.
export const approvalRequestFromOutput = (output: AgentOutput) => {
	const suspension = output.suspension;
	if (!suspension) return;
	return {
		env: output.env,
		preview: suspension.preview,
		runId: output.runId,
		toolArgs: suspension.toolArgs,
		toolCallId: suspension.toolCallId,
		toolName: suspension.toolName,
	};
};

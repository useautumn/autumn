import type { AppEnv } from "@autumn/shared";
import type { AgentOutput } from "../../../types.js";

export type ApprovalRequest = {
	env: AppEnv;
	preview: unknown;
	runId?: string;
	toolArgs: Record<string, unknown>;
	toolCallId?: string;
	toolName: string;
};

// The card renders from structured data only: each suspended write's args for
// its sentence and its captured preview for money facts. Agent prose is posted
// to the thread separately, never scraped into the card.
export const approvalRequestsFromOutput = (
	output: AgentOutput,
): ApprovalRequest[] =>
	(output.suspensions ?? []).map((suspension) => ({
		env: output.env,
		preview: suspension.preview,
		runId: output.runId,
		toolArgs: suspension.toolArgs,
		toolCallId: suspension.toolCallId,
		toolName: suspension.toolName,
	}));

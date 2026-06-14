import Anthropic from "@anthropic-ai/sdk";
import type { ChatApproval } from "@autumn/shared";
import type { ApprovalRunResult } from "../../../internal/approvals/types.js";
import {
	approvalErrorResult,
	isErrorResult,
} from "../../../internal/approvals/utils/approvalErrors.js";
import {
	errorStatusLine,
	toolStatusLine,
} from "../../../internal/approvals/utils/approvalProgress.js";
import { claudeManagedConfig } from "../config.js";
import { driveSessionTurn } from "./driveSessionTurn.js";

const client = new Anthropic();

// Confirms an already-claimed tool in the idle Claude Managed session, then
// returns its write result and any continuation text for the thread reply.
// Finalization is owned by the dispatcher (approveAndRun).
export const resumeClaudeManagedApproval = async ({
	approval,
	onProgress,
}: {
	approval: ChatApproval;
	onProgress?: (statusLine: string) => void;
	providerUserId: string;
}): Promise<ApprovalRunResult> => {
	const sessionId = approval.run_id;
	const toolUseId = approval.tool_call_id;
	if (!(sessionId && toolUseId)) {
		throw new Error("Approval is missing the session or tool-call id");
	}
	const outcome = await driveSessionTurn({
		autumnMcpServerName: claudeManagedConfig.autumnMcpServerName,
		client,
		kickoff: () =>
			client.beta.sessions.events.send(sessionId, {
				events: [
					{
						result: "allow",
						tool_use_id: toolUseId,
						type: "user.tool_confirmation",
					},
				],
			}),
		onAutumnTool: ({ name }) => {
			onProgress?.(toolStatusLine(name));
		},
		onAutumnToolResult: ({ output }) => {
			const errorLine = errorStatusLine(output);
			if (errorLine) onProgress?.(errorLine);
		},
		sessionId,
	});
	const text = outcome.textParts.join("\n\n");
	const writeResult =
		outcome.toolResults?.find((result) => result.id === toolUseId) ??
		outcome.toolResults?.at(-1);
	if (isErrorResult(writeResult?.output) || (outcome.errorMessage && !text)) {
		return approvalErrorResult(writeResult?.output ?? outcome.errorMessage);
	}
	return { result: writeResult?.output, text, toolName: writeResult?.name };
};

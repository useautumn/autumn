import type {
	HarnessAgentContinueTurnState,
	HarnessAgentToolApprovalContinuation,
} from "@ai-sdk/harness/agent";
import type { ChatApproval } from "@autumn/shared";
import { createPreviewCapture } from "../../../agent/tools/toolPolicy.js";
import type { ApprovalRunResult } from "../../../internal/approvals/types.js";
import {
	approvalErrorResult,
	isErrorResult,
} from "../../../internal/approvals/utils/approvalErrors.js";
import {
	errorStatusLine,
	toolStatusLine,
} from "../../../internal/approvals/utils/approvalProgress.js";
import { getOrgInstallationToken } from "../../../internal/installations/actions/getOrgInstallationToken.js";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { autumnChatInstructions } from "../../common/instructions/index.js";
import { buildAutumnHostTools } from "../agent/autumnHostTools.js";
import { buildLeafHarnessAgent } from "../agent/buildHarnessAgent.js";
import { vercelHarnessRepo } from "../repos/vercelHarnessRepo.js";
import type { PersistedHarnessState } from "./driveTurn.js";
import { consumeHarnessStream } from "./streamConsumer.js";

const safeParse = (input: string): unknown => {
	try {
		return JSON.parse(input);
	} catch {
		return {};
	}
};

// Resumes a Vercel-harness turn suspended on a destructive tool: rebuilds the
// agent (host tools included so the approved write can execute), reattaches the
// session, approves the pending tool, and drains the rest.
export const resumeVercelApproval = async ({
	approval,
	onProgress,
}: {
	approval: ChatApproval;
	onProgress?: (statusLine: string) => void;
	providerUserId: string;
}): Promise<ApprovalRunResult> => {
	const sessionId = approval.run_id;
	if (!sessionId) {
		return approvalErrorResult("Approval is missing the session id");
	}

	const row = await vercelHarnessRepo.getBySessionId({ db, sessionId });
	const persisted = row?.resume_state as PersistedHarnessState | undefined;
	if (!(row && persisted) || persisted.kind !== "continue") {
		return approvalErrorResult("No suspended Vercel-harness turn to resume");
	}

	const { accessToken: token } = await getOrgInstallationToken({
		env: approval.env,
		orgId: approval.org_id,
		provider: approval.provider,
		workspaceId: approval.workspace_id,
	});
	const previewCapture = createPreviewCapture();
	const hostTools = await buildAutumnHostTools({
		env: approval.env,
		logger,
		previewCapture,
		token,
	});

	try {
		const agent = await buildLeafHarnessAgent({
			destructiveTools: hostTools.destructiveTools,
			env: approval.env,
			instructions: autumnChatInstructions,
			token,
			tools: hostTools.tools,
		});

		const continueState = persisted.state as HarnessAgentContinueTurnState;
		const session = await agent.createSession({
			continueFrom: continueState,
			sessionId,
		});
		const continuations: HarnessAgentToolApprovalContinuation[] = (
			continueState.pendingToolApprovals ?? []
		).map((pending) => ({
			approvalResponse: {
				approvalId: pending.approvalId,
				approved: true,
				type: "tool-approval-response",
			},
			toolCall: {
				input: safeParse(pending.input),
				toolCallId: pending.toolCallId,
				toolName: pending.toolName,
				type: "tool-call",
			},
		}));

		const result = await agent.continueStream({
			session,
			toolApprovalContinuations: continuations,
		});
		const turn = await consumeHarnessStream({
			onAutumnTool: (name) => onProgress?.(toolStatusLine(name)),
			previewCapture,
			result,
		});
		for (const toolResult of turn.toolResults) {
			const line = errorStatusLine(toolResult.output);
			if (line) onProgress?.(line);
		}

		// Park the session warm for the next thread turn.
		const resumeState = await session.detach();
		await vercelHarnessRepo.setResumeState({
			db,
			env: approval.env,
			orgId: approval.org_id,
			resumeState: {
				kind: "resume",
				state: resumeState,
			} satisfies PersistedHarnessState,
			threadKey: row.thread_key,
		});

		const text = turn.textParts.join("\n\n");
		const writeResult =
			turn.toolResults.find((entry) => entry.id === approval.tool_call_id) ??
			turn.toolResults.at(-1);
		if (isErrorResult(writeResult?.output) || (turn.errorMessage && !text)) {
			logger.error("[chat] Vercel approval run failed", turn.errorMessage, {
				event: "leaf.approval_run_failed",
				approval_id: approval.id,
			});
			return approvalErrorResult(writeResult?.output ?? turn.errorMessage);
		}
		return { result: writeResult?.output, text, toolName: writeResult?.name };
	} finally {
		await hostTools.disconnect();
	}
};

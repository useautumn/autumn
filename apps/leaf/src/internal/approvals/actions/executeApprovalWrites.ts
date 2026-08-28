import type { ChatApproval, ChatApprovalWrite } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { executeAutumnMcpTool } from "../../autumnMcp/client.js";
import { getOrgInstallationToken } from "../../installations/actions/getOrgInstallationToken.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { chatApprovalWritesRepo } from "../repos/chatApprovalWritesRepo.js";
import type { ApprovalRunResult, ApprovalWriteOutcome } from "../types.js";
import { withoutApprovalSummary } from "../utils/approvalSummary.js";
import {
	classifyWriteExecution,
	type WriteExecutionOutcome,
} from "../utils/writeExecutionResult.js";

/** Runs one gated write and classifies the result — a throw is a terminal
 * `unknown` (never blindly retried against a billing API). */
const runWrite = async ({
	env,
	token,
	write,
}: {
	env: ChatApproval["env"];
	token: string;
	write: ChatApprovalWrite;
}): Promise<WriteExecutionOutcome> => {
	try {
		const result = await executeAutumnMcpTool({
			args: withoutApprovalSummary(write.tool_args),
			env,
			token,
			toolName: write.tool_name,
		});
		return classifyWriteExecution({ result });
	} catch (error) {
		return classifyWriteExecution({ error });
	}
};

type ExecutedWrite = {
	outcome: WriteExecutionOutcome | { status: "skipped" };
	write: ChatApprovalWrite;
};

const executeWrites = async ({
	env,
	writes,
	token,
}: {
	env: ChatApproval["env"];
	writes: ReadonlyArray<ChatApprovalWrite>;
	token: string;
}): Promise<ExecutedWrite[]> => {
	const executed: ExecutedWrite[] = [];
	let stopped = false;
	for (const write of writes) {
		if (stopped) {
			await chatApprovalWritesRepo.setStatus({
				db,
				status: "skipped",
				writeId: write.id,
			});
			executed.push({ outcome: { status: "skipped" }, write });
			continue;
		}
		// The durable running marker splits "never started" from "outcome
		// unknown" if the process dies mid-call.
		await chatApprovalWritesRepo.setStatus({
			db,
			status: "running",
			writeId: write.id,
		});
		const outcome = await runWrite({ env, token, write: write });
		await chatApprovalWritesRepo.setStatus({
			db,
			result:
				outcome.status === "applied"
					? outcome.result
					: { message: outcome.detail },
			status: outcome.status,
			writeId: write.id,
		});
		executed.push({ outcome, write });
		if (outcome.status !== "applied") stopped = true;
	}
	return executed;
};

const stepOutcomes = (
	executed: ReadonlyArray<ExecutedWrite>,
): ApprovalWriteOutcome[] =>
	executed.map(({ outcome, write }) => ({
		status: outcome.status,
		toolName: write.tool_name,
	}));

/** Dead-session fallback: the eve session that parked these writes is gone,
 * so the stored writes run directly — the card is the only outcome surface. */
export const executeApprovalWrites = async ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
	providerUserId: string;
}): Promise<ApprovalRunResult | undefined> => {
	const writes = await chatApprovalWritesRepo.list({
		approvalId: approval.id,
		db,
	});
	if (!writes.length) return undefined;

	const { accessToken } = await getOrgInstallationToken({
		env: approval.env,
		orgId: approval.org_id,
		provider: approval.provider,
		workspaceId: approval.workspace_id,
	});

	const executed = await executeWrites({
		env: approval.env,
		writes,
		token: accessToken,
	});
	const allApplied = executed.every(
		({ outcome }) => outcome.status === "applied",
	);
	const failedDetail = executed.find(
		({ outcome }) =>
			outcome.status === "failed" || outcome.status === "unknown",
	)?.outcome;
	await chatApprovalRepo.finalize({
		approvalId: approval.id,
		db,
		providerUserId,
		status: allApplied ? "approved" : "failed",
	});
	logger.info("Executed approved writes without an eve session", {
		event: "leaf.approval_writes_executed",
		approval_id: approval.id,
		data: {
			outcomes: executed.map(({ outcome, write }) => ({
				status: outcome.status,
				tool: write.tool_name,
			})),
		},
	});

	if (!allApplied) {
		return {
			error: true,
			message:
				(failedDetail && "detail" in failedDetail
					? failedDetail.detail
					: undefined) ?? "Some writes were not applied.",
			retryable: false,
			writes: stepOutcomes(executed),
		};
	}
	return {
		result: {},
		writes: stepOutcomes(executed),
		text: "",
		toolName: approval.tool_name,
	};
};

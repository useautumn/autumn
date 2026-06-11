import type Anthropic from "@anthropic-ai/sdk";
import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval } from "@autumn/shared";
import { claudeManagedConfig } from "../../../harness/claudeManaged/config.js";
import {
	driveSessionTurn,
	type SessionTurnOutcome,
} from "../../../harness/claudeManaged/session/driveSessionTurn.js";
import type { ChatDb } from "../../../lib/db.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";

const STALE_APPROVAL_DENY_MESSAGE =
	"User sent new instructions before approving this action.";

type ListPendingApprovalsInput = Parameters<
	typeof chatApprovalRepo.listPendingForRun
>[0];

type CancelApprovalInput = Parameters<typeof chatApprovalRepo.cancel>[0];

type CancelPendingSessionApprovalsDeps = {
	cancelApproval: (input: CancelApprovalInput) => Promise<ChatApproval | undefined>;
	driveTurn: typeof driveSessionTurn;
	listPendingApprovals: (
		input: ListPendingApprovalsInput,
	) => Promise<ChatApproval[]>;
};

const defaultDeps: CancelPendingSessionApprovalsDeps = {
	cancelApproval: chatApprovalRepo.cancel,
	driveTurn: driveSessionTurn,
	listPendingApprovals: chatApprovalRepo.listPendingForRun,
};

export const cancelPendingSessionApprovalsWithDeps = async ({
	client,
	db,
	logger,
	providerUserId,
	query,
	sessionId,
	deps = defaultDeps,
}: {
	client: Anthropic;
	db: ChatDb;
	logger: AutumnLogger;
	providerUserId: string;
	query: Omit<ListPendingApprovalsInput, "db">;
	sessionId: string;
	deps?: CancelPendingSessionApprovalsDeps;
}) => {
	const approvals = await deps.listPendingApprovals({ ...query, db });
	if (approvals.length === 0) return { cancelledCount: 0 };

	const executableApprovals = approvals.filter(
		(approval): approval is ChatApproval & { tool_call_id: string } =>
			Boolean(approval.tool_call_id),
	);

	let outcome: SessionTurnOutcome | undefined;
	if (executableApprovals.length > 0) {
		try {
			outcome = await deps.driveTurn({
				autumnMcpServerName: claudeManagedConfig.autumnMcpServerName,
				client,
				kickoff: () =>
					client.beta.sessions.events.send(sessionId, {
						events: executableApprovals.map((approval) => ({
							deny_message: STALE_APPROVAL_DENY_MESSAGE,
							result: "deny" as const,
							tool_use_id: approval.tool_call_id,
							type: "user.tool_confirmation" as const,
						})),
					}),
				sessionId,
			});
		} catch (error) {
			logger.warn("Failed to deny stale Claude Managed approval", {
				event: "leaf.approval_auto_cancel_deny_failed",
				error,
			});
		}
	}

	for (const approval of approvals) {
		await deps.cancelApproval({
			approvalId: approval.id,
			db,
			providerUserId,
		});
	}

	logger.info("Cancelled stale pending approvals before new user message", {
		event: "leaf.approval_auto_cancelled",
		data: {
			cancelled_count: approvals.length,
			denied_count: executableApprovals.length,
			had_session_error: Boolean(outcome?.errorMessage),
		},
	});

	return { cancelledCount: approvals.length };
};

export const cancelPendingSessionApprovals = async (
	input: Omit<
		Parameters<typeof cancelPendingSessionApprovalsWithDeps>[0],
		"deps"
	>,
) => cancelPendingSessionApprovalsWithDeps(input);

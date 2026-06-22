import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval } from "@autumn/shared";
import type { ChatDb } from "../../../lib/db.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";

type ListPendingApprovalsInput = Parameters<
	typeof chatApprovalRepo.listPendingForRun
>[0];

// Harness-agnostic supersede: cancels a thread's pending approval rows and
// returns them so their Slack cards can be edited. Unlike
// cancelPendingSessionApprovals it sends no harness session events — the
// suspended turn is simply abandoned (the new message starts a fresh turn).
export const supersedeRunApprovals = async ({
	db,
	logger,
	providerUserId,
	query,
}: {
	db: ChatDb;
	logger: AutumnLogger;
	providerUserId: string;
	query: Omit<ListPendingApprovalsInput, "db">;
}) => {
	const approvals = await chatApprovalRepo.listPendingForRun({ ...query, db });
	if (approvals.length === 0) {
		return { cancelledApprovals: [] as ChatApproval[], cancelledCount: 0 };
	}

	const cancelledApprovals: ChatApproval[] = [];
	for (const approval of approvals) {
		const cancelled = await chatApprovalRepo.cancel({
			approvalId: approval.id,
			db,
			providerUserId,
		});
		cancelledApprovals.push(cancelled ?? approval);
	}

	logger.info("Superseded pending approvals before new user message", {
		event: "leaf.approval_superseded",
		data: { cancelled_count: approvals.length },
	});
	return { cancelledApprovals, cancelledCount: approvals.length };
};

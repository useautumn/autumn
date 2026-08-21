import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../../lib/db.js";
import { approvalStatusCard } from "../../../../ui/blocks.js";
import type { ReplyTarget } from "../../../../ui/progress.js";
import { withheldWritesOf } from "../../domain/approvalRecord.js";
import { chatApprovalWritesRepo } from "../../repos/chatApprovalWritesRepo.js";
import type { ActionMessageContent } from "../../types.js";

/** Replaces auto-cancelled approval cards in place so stale Approve buttons disappear. */
export const editSupersededApprovalCards = async ({
	approvals,
	logger,
	target,
}: {
	approvals: ChatApproval[];
	logger: AutumnLogger;
	target: ReplyTarget;
}) => {
	for (const approval of approvals) {
		if (!approval.message_ts) continue;
		try {
			await target.adapter.editMessage?.(
				target.id,
				approval.message_ts,
				approvalStatusCard({
					env: approval.env,
					groupedWrites: withheldWritesOf({
						approval,
						writes: await chatApprovalWritesRepo.list({
							approvalId: approval.id,
							db,
						}),
					}),
					preview: approval.preview ?? undefined,
					status: "superseded",
					toolArgs:
						approval.tool_args && typeof approval.tool_args === "object"
							? (approval.tool_args as Record<string, unknown>)
							: undefined,
					toolName: approval.tool_name,
				}) as ActionMessageContent,
			);
		} catch (error) {
			logger.warn("Could not edit superseded approval card", {
				event: "leaf.approval_superseded_edit_failed",
				approval_id: approval.id,
				error,
			});
		}
	}
};

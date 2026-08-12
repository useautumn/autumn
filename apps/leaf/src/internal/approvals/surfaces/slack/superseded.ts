import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval } from "@autumn/shared";
import { approvalStatusCard } from "../../../../ui/blocks.js";
import type { ReplyTarget } from "../../../../ui/progress.js";
import type { ActionMessageContent } from "../../types.js";
import { approvalCardItems } from "./cardItems.js";

/** Rows decided on one card share a group; only the posted row carries the
 * message id, so the whole group has to be redrawn under it. */
const byGroup = (approvals: ChatApproval[]) => {
	const groups = new Map<string, ChatApproval[]>();
	for (const approval of approvals) {
		const key = approval.group_id ?? approval.id;
		groups.set(key, [...(groups.get(key) ?? []), approval]);
	}
	return [...groups.values()];
};

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
	for (const group of byGroup(approvals)) {
		const posted = group.find((approval) => approval.message_ts);
		if (!posted?.message_ts) continue;
		try {
			await target.adapter.editMessage?.(
				target.id,
				posted.message_ts,
				approvalStatusCard({
					env: posted.env,
					items: approvalCardItems(group),
					status: "superseded",
				}) as ActionMessageContent,
			);
		} catch (error) {
			logger.warn("Could not edit superseded approval card", {
				event: "leaf.approval_superseded_edit_failed",
				approval_id: posted.id,
				error,
			});
		}
	}
};

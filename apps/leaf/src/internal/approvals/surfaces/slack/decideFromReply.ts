import type { ChatApproval } from "@autumn/shared";
import type { ActionEvent } from "chat";
import type { ReplyTarget } from "../../../../ui/progress.js";
import { handleApprovalActionWithDeps } from "./decide.js";

/** Decides the thread's pending card from a typed reply through the exact path
 * a button click takes — claim, authorization, drift guard, and card edits. */
export const decideApprovalFromReply = async ({
	approval,
	decision,
	providerUserId,
	target,
}: {
	approval: ChatApproval;
	decision: "approve" | "cancel";
	providerUserId: string;
	target: ReplyTarget;
}) =>
	handleApprovalActionWithDeps({
		event: {
			actionId:
				decision === "approve"
					? "approve_billing_action"
					: "cancel_billing_action",
			adapter: target.adapter,
			messageId: approval.message_ts ?? "",
			thread: target,
			threadId: target.id,
			user: { userId: providerUserId },
			value: approval.id,
		} as unknown as ActionEvent,
	});

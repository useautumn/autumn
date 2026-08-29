import type { AppEnv, ChatApproval, ChatProvider } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { approvalDecidability } from "../utils/approvalDecidability.js";
import { approvalReplyIntent } from "../utils/approvalReplyIntent.js";

export const APPROVAL_REPLY_GUIDANCE =
	"Tap Approve or Dismiss on the pending card above.";

export type PendingApprovalReply =
	| { approval: ChatApproval; decision: "approve" | "cancel" }
	| { guidance: string };

export const matchPendingApprovalReply = async ({
	channelId,
	env,
	orgId,
	provider,
	runId,
	text,
	workspaceId,
}: {
	channelId: string;
	env: AppEnv;
	orgId: string;
	provider: ChatProvider;
	runId: string;
	text: string;
	workspaceId: string;
}): Promise<PendingApprovalReply | undefined> => {
	const intent = approvalReplyIntent(text);
	if (!intent) return undefined;
	const pending = (
		await chatApprovalRepo.listPendingForRun({
			channelId,
			db,
			env,
			orgId,
			provider,
			runId,
			workspaceId,
		})
	).filter((approval) => approvalDecidability({ approval }).decidable);
	if (!pending.length) return undefined;
	const [approval] = pending;
	if (
		intent.kind === "ambiguous" ||
		pending.length > 1 ||
		!approval.message_ts
	) {
		return { guidance: APPROVAL_REPLY_GUIDANCE };
	}
	return { approval, decision: intent.kind };
};

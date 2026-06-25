import type { ChatProvider } from "@autumn/shared";
import { db } from "../../../../lib/db.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";

/** A pending approval, shaped for the dashboard to render (preview + the write's args). */
export type WebApproval = {
	id: string;
	tool_name: string;
	tool_args: unknown;
	preview: unknown;
	created_at: number;
};

/** Pending approvals for an org's web chat, newest first. */
export const listWebApprovals = async ({
	orgId,
	provider,
	workspaceId,
}: {
	orgId: string;
	provider: ChatProvider;
	workspaceId: string;
}): Promise<WebApproval[]> => {
	const approvals = await chatApprovalRepo.listPendingForOrg({
		db,
		orgId,
		provider,
		workspaceId,
	});
	return approvals.map((approval) => ({
		id: approval.id,
		tool_name: approval.tool_name,
		tool_args: approval.tool_args,
		preview: approval.preview,
		created_at: approval.created_at,
	}));
};

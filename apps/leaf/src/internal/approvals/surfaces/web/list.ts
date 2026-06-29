import type { AppEnv, ChatProvider } from "@autumn/shared";
import { db } from "../../../../lib/db.js";
import { parsePreviewPayload } from "../../../../ui/previewContent.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";

/** A pending approval, shaped for the dashboard to render (preview + the write's args). */
export type WebApproval = {
	id: string;
	tool_name: string;
	tool_args: unknown;
	preview: unknown;
	created_at: number;
};

/** Pending approvals for a web chat thread, newest first. */
export const listWebApprovals = async ({
	channelId,
	env,
	orgId,
	provider,
	workspaceId,
}: {
	channelId?: string;
	env: AppEnv;
	orgId: string;
	provider: ChatProvider;
	workspaceId: string;
}): Promise<WebApproval[]> => {
	const approvals = await chatApprovalRepo.listPendingForOrg({
		channelId,
		db,
		env,
		orgId,
		provider,
		workspaceId,
	});
	return approvals.map((approval) => ({
		id: approval.id,
		tool_name: approval.tool_name,
		tool_args: approval.tool_args,
		// Stored raw as the MCP tool envelope; unwrap to the inner { plans, features }.
		preview: parsePreviewPayload(approval.preview),
		created_at: approval.created_at,
	}));
};

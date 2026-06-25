import { type ChatProvider, chatApprovals } from "@autumn/shared";
import { and, desc, eq, gt } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

/** Pending, unexpired approvals for an org's provider workspace — used by the
 * web surface, where the dashboard fetches approvals by org rather than run. */
export const listPendingChatApprovalsForOrg = async ({
	channelId,
	db,
	orgId,
	provider,
	workspaceId,
}: {
	channelId?: string;
	db: ChatDb;
	orgId: string;
	provider: ChatProvider;
	workspaceId: string;
}) =>
	await db.query.chatApprovals.findMany({
		orderBy: desc(chatApprovals.created_at),
		where: and(
			eq(chatApprovals.org_id, orgId),
			eq(chatApprovals.provider, provider),
			eq(chatApprovals.workspace_id, workspaceId),
			channelId ? eq(chatApprovals.channel_id, channelId) : undefined,
			eq(chatApprovals.status, "pending"),
			gt(chatApprovals.expires_at, Date.now()),
		),
	});

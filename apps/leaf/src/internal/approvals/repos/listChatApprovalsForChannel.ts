import { type ChatProvider, chatApprovals } from "@autumn/shared";
import { and, asc, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

/** All approvals (any status) for a channel, oldest first — used to replay
 * historical approval cards into the dashboard thread on refresh. */
export const listChatApprovalsForChannel = async ({
	channelId,
	db,
	orgId,
	provider,
	workspaceId,
}: {
	channelId: string;
	db: ChatDb;
	orgId: string;
	provider: ChatProvider;
	workspaceId: string;
}) =>
	await db.query.chatApprovals.findMany({
		orderBy: asc(chatApprovals.created_at),
		where: and(
			eq(chatApprovals.org_id, orgId),
			eq(chatApprovals.provider, provider),
			eq(chatApprovals.workspace_id, workspaceId),
			eq(chatApprovals.channel_id, channelId),
		),
	});

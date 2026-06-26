import { type AppEnv, type ChatProvider, chatApprovals } from "@autumn/shared";
import { and, asc, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

/** All approvals (any status) for a channel in an env, oldest first — used to
 * replay historical approval cards into the dashboard thread on refresh. */
export const listChatApprovalsForChannel = async ({
	channelId,
	db,
	env,
	orgId,
	provider,
	workspaceId,
}: {
	channelId: string;
	db: ChatDb;
	env: AppEnv;
	orgId: string;
	provider: ChatProvider;
	workspaceId: string;
}) =>
	await db.query.chatApprovals.findMany({
		orderBy: asc(chatApprovals.created_at),
		where: and(
			eq(chatApprovals.org_id, orgId),
			eq(chatApprovals.env, env),
			eq(chatApprovals.provider, provider),
			eq(chatApprovals.workspace_id, workspaceId),
			eq(chatApprovals.channel_id, channelId),
		),
	});

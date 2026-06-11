import { type AppEnv, type ChatProvider, chatApprovals } from "@autumn/shared";
import { and, desc, eq, gt } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

export const listPendingChatApprovalsForRun = async ({
	channelId,
	db,
	env,
	orgId,
	provider,
	runId,
	workspaceId,
}: {
	channelId: string;
	db: ChatDb;
	env: AppEnv;
	orgId: string;
	provider: ChatProvider;
	runId: string;
	workspaceId: string;
}) =>
	await db.query.chatApprovals.findMany({
		orderBy: desc(chatApprovals.created_at),
		where: and(
			eq(chatApprovals.org_id, orgId),
			eq(chatApprovals.provider, provider),
			eq(chatApprovals.workspace_id, workspaceId),
			eq(chatApprovals.channel_id, channelId),
			eq(chatApprovals.env, env),
			eq(chatApprovals.run_id, runId),
			eq(chatApprovals.status, "pending"),
			gt(chatApprovals.expires_at, Date.now()),
		),
	});

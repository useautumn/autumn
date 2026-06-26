import { type AppEnv, type ChatProvider, chatApprovals } from "@autumn/shared";
import { and, desc, eq, gt } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

/** Pending, unexpired approvals for an org's provider workspace in a given env —
 * used by the web surface, where the dashboard fetches approvals by org rather
 * than run. Env-scoped so a sandbox dashboard never shows live approvals. */
export const listPendingChatApprovalsForOrg = async ({
	channelId,
	db,
	env,
	orgId,
	provider,
	workspaceId,
}: {
	channelId?: string;
	db: ChatDb;
	env: AppEnv;
	orgId: string;
	provider: ChatProvider;
	workspaceId: string;
}) =>
	await db.query.chatApprovals.findMany({
		orderBy: desc(chatApprovals.created_at),
		// Pending approvals are transient (and usually channel-scoped), but cap to
		// the newest so an org that piled up undecided approvals can't blow up the
		// dashboard fetch.
		limit: 20,
		where: and(
			eq(chatApprovals.org_id, orgId),
			eq(chatApprovals.env, env),
			eq(chatApprovals.provider, provider),
			eq(chatApprovals.workspace_id, workspaceId),
			channelId ? eq(chatApprovals.channel_id, channelId) : undefined,
			eq(chatApprovals.status, "pending"),
			gt(chatApprovals.expires_at, Date.now()),
		),
	});

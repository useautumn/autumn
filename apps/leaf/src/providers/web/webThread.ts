import type { AppEnv, ChatProvider } from "@autumn/shared";
import type { ThreadRef } from "../../agent/runMessage/types.js";
import {
	deleteHarnessSessionsByPrefix,
	listHarnessSessions,
} from "../../harness/eve/repo.js";
import { WEB_CHAT_PROVIDER } from "../../internal/installations/actions/ensureWebChatAuth.js";
import type { ChatDb } from "../../lib/db.js";

/** The chat-sdk thread id for a dashboard conversation. `getUser` encodes the
 * org into the user id with `~`; the conversation id is the dashboard route id. */
export const buildWebChatThreadId = ({
	conversationId,
	orgId,
	userId,
}: {
	conversationId: string;
	orgId: string;
	userId: string;
}) => `web:${userId}~${orgId}:${conversationId}`;

/** ThreadRef for a web conversation, built one way so the CMA `threadKey` matches
 * between a live turn (runWebMessage) and history hydration. */
export type WebThreadSummary = {
	id: string;
	title: string | null;
	updatedAt: number;
};

/** thread_key prefix (provider:workspace:channel…) covering one user's
 * dashboard conversations; the conversation id is the segment after it. */
const webThreadKeyPrefix = ({
	orgId,
	userId,
}: {
	orgId: string;
	userId: string;
}) => `${WEB_CHAT_PROVIDER}:${orgId}:web:${userId}~${orgId}:`;

/** Recent dashboard conversations for one user, newest first. Sessions are
 * keyed by thread_key (provider:workspace:channel:thread:env), so the user's
 * threads are a key-prefix scan within org+env. */
export const listWebThreads = async ({
	db,
	env,
	limit = 10,
	orgId,
	userId,
}: {
	db: ChatDb;
	env: AppEnv;
	limit?: number;
	orgId: string;
	userId: string;
}): Promise<WebThreadSummary[]> => {
	const threadKeyPrefix = webThreadKeyPrefix({ orgId, userId });
	const rows = await listHarnessSessions({
		db,
		env,
		limit,
		orgId,
		threadKeyPrefix,
	});
	return rows.flatMap((row) => {
		const conversationId = row.thread_key
			.slice(threadKeyPrefix.length)
			.split(":")[0];
		if (!conversationId) return [];
		return [
			{ id: conversationId, title: row.title, updatedAt: row.updated_at },
		];
	});
};

/** Delete every dashboard conversation for one user in the current env. The
 * remote eve sessions survive but become unreachable, which is the intent. */
export const deleteWebThreads = async ({
	db,
	env,
	orgId,
	userId,
}: {
	db: ChatDb;
	env: AppEnv;
	orgId: string;
	userId: string;
}) => {
	await deleteHarnessSessionsByPrefix({
		db,
		env,
		orgId,
		threadKeyPrefix: webThreadKeyPrefix({ orgId, userId }),
	});
};

export const webThreadRef = ({
	chatThreadId,
	orgId,
}: {
	chatThreadId: string;
	orgId: string;
}): ThreadRef => ({
	channelId: chatThreadId,
	provider: WEB_CHAT_PROVIDER as ChatProvider,
	threadId: chatThreadId,
	workspaceId: orgId,
});

import type { AppEnv } from "@autumn/shared";
import type { AgentThreadRef } from "../../internal/agentRuntime/domain/agentTurnContext.js";
import {
	deleteHarnessSessionsByPrefix,
	listHarnessSessions,
} from "../../internal/agentRuntime/eve/repo.js";
import { WEB_CHAT_PROVIDER } from "../../internal/installations/actions/ensureWebChatAuth.js";
import type { ChatDb } from "../../lib/db.js";

const DEFAULT_WEB_THREAD_LIMIT = 10;

export const buildWebChatThreadId = ({
	conversationId,
	orgId,
	userId,
}: {
	conversationId: string;
	orgId: string;
	userId: string;
}) => `web:${userId}~${orgId}:${conversationId}`;

export type WebThreadSummary = {
	id: string;
	title: string | null;
	updatedAt: number;
};

const webThreadKeyPrefix = ({
	orgId,
	userId,
}: {
	orgId: string;
	userId: string;
}) => `${WEB_CHAT_PROVIDER}:${orgId}:web:${userId}~${orgId}:`;

export const listWebThreads = async ({
	db,
	env,
	limit = DEFAULT_WEB_THREAD_LIMIT,
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
}): AgentThreadRef => ({
	channelId: chatThreadId,
	provider: WEB_CHAT_PROVIDER,
	threadId: chatThreadId,
	workspaceId: orgId,
});

import type { ChatProvider } from "@autumn/shared";
import type { ThreadRef } from "../../agent/runMessage/types.js";
import { WEB_CHAT_PROVIDER } from "../../internal/installations/actions/ensureWebChatAuth.js";

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

import type { AppEnv } from "@autumn/shared";
import type { Message } from "chat";
import { bot } from "../../../bot.js";
import { getEveSession } from "../../../internal/agentRuntime/eve/repo.js";
import { WEB_CHAT_PROVIDER } from "../../../internal/installations/actions/ensureWebChatAuth.js";
import { db } from "../../../lib/db.js";
import { buildEveWebHistory } from "../history/buildEveWebHistory.js";
import { buildLegacyClaudeHistory } from "../history/buildLegacyClaudeHistory.js";
import type { LeafUiMessage } from "../types.js";
import { buildWebChatThreadId, webThreadRef } from "../webThread.js";

const messageToUiMessage = (message: Message): LeafUiMessage => ({
	id: message.id,
	parts: [{ text: message.text, type: "text" }],
	role: message.author.isBot === true ? "assistant" : "user",
});

export const getWebChatMessages = async ({
	conversationId,
	env,
	orgId,
	userId,
}: {
	conversationId: string;
	env: AppEnv;
	orgId: string;
	userId: string;
}): Promise<LeafUiMessage[]> => {
	const chatThreadId = buildWebChatThreadId({
		conversationId,
		orgId,
		userId,
	});
	const thread = webThreadRef({ chatThreadId, orgId });
	const eveSession = await getEveSession({ db, env, orgId, thread });
	if (eveSession) {
		return buildEveWebHistory({
			auth: {
				appEnv: env,
				channelId: thread.channelId,
				orgId,
				provider: WEB_CHAT_PROVIDER,
				providerUserId: userId,
				threadId: thread.threadId,
				workspaceId: orgId,
			},
			channelId: chatThreadId,
			db,
			env,
			orgId,
			provider: WEB_CHAT_PROVIDER,
			session: eveSession,
			workspaceId: orgId,
		});
	}

	const legacyMessages = await buildLegacyClaudeHistory({
		channelId: chatThreadId,
		db,
		env,
		orgId,
		provider: WEB_CHAT_PROVIDER,
		thread,
		workspaceId: orgId,
	});
	if (legacyMessages) return legacyMessages;

	await bot.initialize();
	const chatThread = bot.thread(chatThreadId);
	const messages: LeafUiMessage[] = [];
	for await (const message of chatThread.messages) {
		if (message.text.trim()) messages.push(messageToUiMessage(message));
	}
	return messages.reverse();
};

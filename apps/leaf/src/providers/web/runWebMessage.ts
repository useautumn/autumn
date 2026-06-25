import crypto from "node:crypto";
import { AppEnv, type ChatProvider } from "@autumn/shared";
import type { Message, Thread } from "chat";
import { agentEngines } from "../../agent/runMessage/engines/engines.js";
import { setupAgentToolContext } from "../../agent/runMessage/setup/setupAgentToolContext.js";
import type { MessageContext } from "../../agent/runMessage/types.js";
import {
	ensureWebChatAuth,
	WEB_CHAT_PROVIDER,
} from "../../internal/installations/actions/ensureWebChatAuth.js";
import { presentWebApproval } from "../../internal/approvals/surfaces/web/present.js";
import { getRecentMessages } from "../slack/threadContext.js";
import { getOrgInstallationToken } from "../../internal/installations/actions/getOrgInstallationToken.js";
import { env as chatEnv } from "../../lib/env.js";
import { logger as rootLogger } from "../../lib/logger.js";

/** Web dashboard chat: resolve org auth, build context, dispatch via WEB_AGENT_HARNESS. */
export const runWebMessage = async ({
	message,
	thread,
}: {
	message: Message;
	thread: Thread;
}): Promise<void> => {
	const [userId, orgId] = message.author.userId.split("~");
	if (!(userId && orgId)) {
		await thread.post("Not authenticated.");
		return;
	}

	const env = AppEnv.Sandbox;
	const logger = rootLogger;

	await ensureWebChatAuth({ orgId, userId });
	const harness = chatEnv.WEB_AGENT_HARNESS;
	const { accessToken } = await getOrgInstallationToken({
		env,
		orgId,
		provider: WEB_CHAT_PROVIDER,
		workspaceId: orgId,
	});
	const agentTools =
		harness === "claude-managed"
			? { destructiveTools: new Set<string>(), docsText: "" }
			: await setupAgentToolContext({ env, logger, token: accessToken });

	const ctx: MessageContext = {
		agentTools,
		env,
		id: crypto.randomUUID(),
		logger,
		onTurnComplete: async (text) => {
			await thread.post(text);
		},
		org: { id: orgId },
		providerUserId: userId,
		thread: {
			channelId: thread.id,
			provider: WEB_CHAT_PROVIDER as ChatProvider,
			threadId: thread.id,
			workspaceId: orgId,
		},
		timestamp: Date.now(),
		token: accessToken,
	};

	const recentMessages = await getRecentMessages(thread, message);
	const output = await agentEngines[harness].run({
		ctx,
		params: { text: message.text, recentMessages },
	});
	if (output.text) {
		await thread.post(output.text);
	}

	// A destructive write suspended the turn — record an approval the dashboard
	// fetches + resolves via /agent/interactions (the web stream is text-only).
	if (output.suspension) {
		await presentWebApproval({
			channelId: thread.id,
			harness,
			logger,
			orgId,
			output,
			provider: WEB_CHAT_PROVIDER as ChatProvider,
			providerUserId: userId,
			token: accessToken,
			workspaceId: orgId,
		});
	}
};

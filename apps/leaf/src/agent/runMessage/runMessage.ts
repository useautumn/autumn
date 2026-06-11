import { getInstallationOAuthAccessToken } from "../../internal/installations/actions/getInstallationOAuthAccessToken.js";
import { messageTimeoutMs } from "../../lib/chatAgentConfig.js";
import { env as chatEnv } from "../../lib/env.js";
import { logger as rootLogger } from "../../lib/logger.js";
import type { BotMessage } from "../../types.js";
import { agentEngines } from "./engines/engines.js";
import { prepareAttachmentMessage } from "./setup/prepareAttachments.js";
import { selectChatEnv } from "./setup/selectChatEnv.js";
import { setupAgentToolContext } from "./setup/setupAgentToolContext.js";
import type { MessageContext, MessageParams } from "./types.js";

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
	new Promise<T>((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error("Chat agent timed out")),
			ms,
		);
		promise.then(resolve, reject).finally(() => clearTimeout(timeout));
	});

/** Entry point for one chat message: staged ctx build, then engine dispatch. */
export const runMessage = async ({
	agentRunId,
	attachmentFetchFallback,
	attachments,
	installation,
	logger = rootLogger,
	onAction,
	recentMessages,
	text,
	channelId,
	threadId,
}: BotMessage) =>
	withTimeout(
		(async () => {
			const engine = agentEngines[chatEnv.AGENT_HARNESS];

			// 1. Params: validate + fetch attachments.
			const prepared = await prepareAttachmentMessage({
				attachments,
				fetchFallback: attachmentFetchFallback,
				logger,
				text,
			});
			const params: MessageParams = {
				attachments: prepared.parts.map((part) => ({
					data: part.data,
					mimeType: part.mediaType,
					name: part.filename,
				})),
				recentMessages,
				text: prepared.userText,
			};

			// 2. Environment (sandbox vs live).
			const env = await selectChatEnv({
				message: prepared.envSelectionText,
				recentMessages,
				logger,
			});
			logger.info("Selected chat environment", {
				event: "leaf.chat_env_selected",
				context: {
					env,
					org_id: installation.org_id,
					provider: installation.provider,
				},
			});

			// 3. Org+env OAuth token (Autumn MCP auth).
			const token = await getInstallationOAuthAccessToken({
				installation,
				env,
			});

			// 4. Tool metadata + docs (leaf's ctx.features analog).
			const agentTools = await setupAgentToolContext({ env, logger, token });

			// 5. Complete context.
			const ctx: MessageContext = {
				agentTools,
				env,
				id: agentRunId ?? crypto.randomUUID(),
				logger,
				onAction,
				org: {
					id: installation.org_id,
					slug: installation.org_slug ?? undefined,
				},
				thread: {
					channelId,
					provider: installation.provider,
					threadId,
					workspaceId: installation.workspace_id,
				},
				timestamp: Date.now(),
				token,
			};

			// 6. Engine dispatch.
			return engine.run({ ctx, params });
		})(),
		messageTimeoutMs[chatEnv.AGENT_HARNESS],
	);

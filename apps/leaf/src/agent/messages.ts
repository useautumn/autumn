import { getInstallationOAuthAccessToken } from "../internal/installations/actions/getInstallationOAuthAccessToken.js";
import { logger as rootLogger } from "../lib/logger.js";
import { agentOutputSchema, type BotMessage } from "../types.js";
import { runChatAgent, selectChatEnv } from "./agent.js";
import { prepareAttachmentMessage } from "./attachments.js";

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
	new Promise<T>((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error("Chat agent timed out")),
			ms,
		);
		promise.then(resolve, reject).finally(() => clearTimeout(timeout));
	});

export const runMessage = async ({
	attachmentFetchFallback,
	attachments,
	installation,
	logger = rootLogger,
	onAction,
	recentMessages,
	text,
	threadId,
}: BotMessage) =>
	withTimeout(
		(async () => {
			const preparedMessage = await prepareAttachmentMessage({
				attachments,
				fetchFallback: attachmentFetchFallback,
				logger,
				text,
			});
			const env = await selectChatEnv({
				message: preparedMessage.envSelectionText,
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
			const token = await getInstallationOAuthAccessToken({
				installation,
				env,
			});
			return agentOutputSchema.parse(
				await runChatAgent({
					token,
					env,
					logger,
					message: preparedMessage.message,
					onAction,
					threadId,
					resourceId: installation.org_id,
					provider: installation.provider,
					recentMessages,
				}),
			);
		})(),
		60_000,
	);

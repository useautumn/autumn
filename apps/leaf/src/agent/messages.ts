import { logger as rootLogger } from "../lib/logger.js";
import { getInstallationKey } from "../providers/slack/installations.js";
import { agentOutputSchema, type BotMessage } from "../types.js";
import { runChatAgent, selectChatEnv } from "./agent.js";

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
	new Promise<T>((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error("Chat agent timed out")),
			ms,
		);
		promise.then(resolve, reject).finally(() => clearTimeout(timeout));
	});

export const runMessage = async ({
	installation,
	logger = rootLogger,
	onAction,
	recentMessages,
	text,
	threadId,
}: BotMessage) =>
	withTimeout(
		(async () => {
			const env = await selectChatEnv({
				message: text,
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
			return agentOutputSchema.parse(
				await runChatAgent({
					apiKey: getInstallationKey(installation, env),
					env,
					logger,
					message: text,
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

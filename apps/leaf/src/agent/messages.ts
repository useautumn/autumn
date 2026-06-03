import { runChatAgent, selectChatEnv } from "./agent.js";
import { getInstallationKey } from "../providers/slack/installations.js";
import { agentOutputSchema, type BotMessage } from "../types.js";

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
			});
			return agentOutputSchema.parse(
				await runChatAgent({
					apiKey: getInstallationKey(installation, env),
					env,
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

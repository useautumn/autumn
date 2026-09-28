import type { RemoteWebhook } from "./types";
import { webhookEnvSkipWarning } from "./webhookEnvSkipWarning";
import type { WebhookPullEnv } from "./webhookPullEnvs";

/**
 * Lists every env in parallel. A rejected key, one for another org, or a 404
 * (a deleted sandbox) skips its env with one warning; anything else fails the pull.
 */
export const readWebhookEnvs = async ({
	envs,
}: {
	envs: WebhookPullEnv[];
}): Promise<{
	read: { envKey: string; list: RemoteWebhook[] }[];
	skipped: string[];
}> => {
	const results = await Promise.all(
		envs.map(async (env) => {
			try {
				const [envKey, { list }] = await Promise.all([
					env.envKey(),
					env.listWebhooks(),
				]);
				return { envKey, list };
			} catch (error) {
				const warning = webhookEnvSkipWarning({ env, error });
				if (warning === undefined) throw error;
				return warning;
			}
		}),
	);
	return {
		read: results.filter((result) => typeof result !== "string"),
		skipped: results.filter((result) => typeof result === "string"),
	};
};

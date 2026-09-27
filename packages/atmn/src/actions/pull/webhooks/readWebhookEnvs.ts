import { AutumnApiError } from "../../../generated/client";
import type { RemoteWebhook } from "./types";
import { ForeignOrgKeyError, type WebhookPullEnv } from "./webhookPullEnvs";

const isRejectedKey = (error: unknown): boolean =>
	error instanceof AutumnApiError &&
	(error.status === 401 || error.status === 403);

/**
 * Lists every env in parallel. A rejected key, or one for another org, skips
 * its env with one warning; any other failure fails the pull.
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
				if (error instanceof ForeignOrgKeyError)
					return `⚠ webhooks: skipped ${env.label} (${env.keyName} belongs to another org)`;
				if (!isRejectedKey(error)) throw error;
				return `⚠ webhooks: skipped ${env.label} (${env.keyName} was rejected)`;
			}
		}),
	);
	return {
		read: results.filter((result) => typeof result !== "string"),
		skipped: results.filter((result) => typeof result === "string"),
	};
};

import { AutumnApiError } from "../../../generated/client";
import type { RemoteWebhook } from "./types";
import { ForeignOrgKeyError, type WebhookPullEnv } from "./webhookPullEnvs";

/** Why a 4xx skips its env; null when the failure should fail the pull. */
const skipReason = (error: unknown): string | null => {
	if (error instanceof ForeignOrgKeyError) return "belongs to another org";
	if (!(error instanceof AutumnApiError)) return null;
	if (error.status === 401 || error.status === 403) return "was rejected";
	if (error.status < 400 || error.status >= 500) return null;
	const { message } = (error.body ?? {}) as { message?: unknown };
	return `failed: ${typeof message === "string" ? message : error.status}`;
};

/**
 * Lists every env in parallel. A rejected key, one for another org, or any
 * other 4xx (a deleted sandbox) skips its env with one warning; a 5xx fails the pull.
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
				const reason = skipReason(error);
				if (reason === null) throw error;
				return `⚠ webhooks: skipped ${env.label} (${env.keyName} ${reason})`;
			}
		}),
	);
	return {
		read: results.filter((result) => typeof result !== "string"),
		skipped: results.filter((result) => typeof result === "string"),
	};
};

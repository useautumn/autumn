import { AutumnApiError } from "../../../generated/client";
import { ForeignOrgKeyError, type WebhookPullEnv } from "./webhookPullEnvs";

/** Why a failure skips its env; null when it should fail the command. */
const skipReason = (error: unknown): string | null => {
	if (error instanceof ForeignOrgKeyError) return "belongs to another org";
	if (!(error instanceof AutumnApiError)) return null;
	if (error.status === 401 || error.status === 403) return "was rejected";
	if (error.status !== 404) return null;
	const { message } = (error.body ?? {}) as { message?: unknown };
	return `failed: ${typeof message === "string" ? message : error.status}`;
};

/**
 * A rejected key, one for another org, or a 404 (a deleted sandbox) skips its
 * env with this warning; anything else is a real failure.
 */
export const webhookEnvSkipWarning = ({
	env,
	error,
}: {
	env: Pick<WebhookPullEnv, "label" | "keyName">;
	error: unknown;
}): string | undefined => {
	const reason = skipReason(error);
	return reason === null
		? undefined
		: `⚠ webhooks: skipped ${env.label} (${env.keyName} ${reason})`;
};

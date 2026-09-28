import { AutumnApiError } from "../../../generated/client";
import { ForeignOrgKeyError, type WebhookPullEnv } from "./webhookPullEnvs";

const isRejectedKey = (error: unknown): boolean =>
	error instanceof AutumnApiError &&
	(error.status === 401 || error.status === 403);

/** A rejected key, or one for another org, skips its env with this warning; anything else is a real failure. */
export const webhookEnvSkipWarning = ({
	env,
	error,
}: {
	env: Pick<WebhookPullEnv, "label" | "keyName">;
	error: unknown;
}): string | undefined => {
	if (error instanceof ForeignOrgKeyError)
		return `⚠ webhooks: skipped ${env.label} (${env.keyName} belongs to another org)`;
	if (isRejectedKey(error))
		return `⚠ webhooks: skipped ${env.label} (${env.keyName} was rejected)`;
	return undefined;
};

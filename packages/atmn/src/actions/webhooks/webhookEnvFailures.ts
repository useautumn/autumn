/** One env's failed webhook preview or sync. */
export type WebhookEnvFailure = { env: string; message: string };

/** Names each env only when several were in play, so a lone env reads as it always has. */
export const throwWebhookEnvFailures = ({
	failures,
	envCount,
}: {
	failures: WebhookEnvFailure[];
	envCount: number;
}): void => {
	if (failures.length === 0) return;
	throw new Error(
		failures
			.map(({ env, message }) =>
				envCount > 1 ? message.replace(/^/gm, `${env}: `) : message,
			)
			.join("\n"),
	);
};

export const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

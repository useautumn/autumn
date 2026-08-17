import { getAutumnEnv } from "@autumn/env";
import { AppEnv } from "@autumn/shared";
import type { initRevenuecatCli } from "./initRevenuecatCli.js";

type RcCli = ReturnType<typeof initRevenuecatCli>;

export const getRevenuecatWebhookUrl = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}): string => {
	// `:env` segment is the AppEnv value ("sandbox"/"live") — revenueCatMiddleware reads it verbatim.
	return `${getAutumnEnv().AUTUMN_PUBLIC_API_URL}/webhooks/revenuecat/${orgId}/${env}`;
};

/**
 * Idempotently register the org's RevenueCat webhook for an env: one integration per
 * environment, matched by URL, with the org's webhook secret as the Authorization header.
 */
export const registerRevenuecatWebhook = async ({
	rcCli,
	orgId,
	env,
	secret,
}: {
	rcCli: RcCli;
	orgId: string;
	env: AppEnv;
	secret: string;
}): Promise<"exists" | "created"> => {
	const url = getRevenuecatWebhookUrl({ orgId, env });

	const existing = await rcCli.listWebhookIntegrations();
	if (existing.some((webhook) => webhook.url === url)) return "exists";

	await rcCli.createWebhookIntegration({
		name: `Autumn (${env})`,
		url,
		authorization_header: secret,
		environment: env === AppEnv.Live ? "production" : "sandbox",
		// no event_types / app_id → all events, all apps for this environment
	});
	return "created";
};

import { AppEnv } from "@autumn/shared";
import type { initRevenuecatCli } from "./initRevenuecatCli.js";

type RcCli = ReturnType<typeof initRevenuecatCli>;

/**
 * Outbound base URL for our webhook receiver. Dev/staging use NGROK_URL (so RevenueCat
 * can reach a local tunnel); production uses BETTER_AUTH_URL.
 */
const getServerBaseUrl = (): string | undefined =>
	process.env.NODE_ENV !== "production"
		? process.env.NGROK_URL
		: process.env.BETTER_AUTH_URL;

export const getRevenuecatWebhookUrl = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}): string | null => {
	const base = getServerBaseUrl();
	if (!base) return null;
	// `:env` segment is the AppEnv value ("sandbox"/"live") — revenueCatMiddleware reads it verbatim.
	return `${base.replace(/\/$/, "")}/webhooks/revenuecat/${orgId}/${env}`;
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
}): Promise<"exists" | "created" | "skipped"> => {
	const url = getRevenuecatWebhookUrl({ orgId, env });
	if (!url) return "skipped";

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

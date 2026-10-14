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
	return `${getAutumnEnv().AUTUMN_PUBLIC_API_URL}/webhooks/revenuecat/${orgId}/${env}`;
};

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
	});
	return "created";
};

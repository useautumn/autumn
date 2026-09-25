import type { Webhook } from "@autumn/shared";
import { listAllSvixEndpoints } from "@/external/svix/endpoints/listAllSvixEndpoints.js";
import { svixEndpointToWebhook } from "@/external/svix/endpoints/svixEndpointToWebhook.js";
import type { WebhookApp } from "./apps/webhookApps.js";

/** Every webhook across the env's apps. */
export const listWebhooks = async ({
	apps,
}: {
	apps: WebhookApp[];
}): Promise<Webhook[]> =>
	(
		await Promise.all(
			apps.map(async ({ appId }) =>
				(
					await listAllSvixEndpoints({ appId })
				).map((endpoint) => svixEndpointToWebhook({ endpoint })),
			),
		)
	).flat();

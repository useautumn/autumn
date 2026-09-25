import type { Webhook } from "@autumn/shared";
import { listAllSvixEndpoints } from "@/external/svix/endpoints/listAllSvixEndpoints.js";
import { svixEndpointToWebhook } from "@/external/svix/endpoints/svixEndpointToWebhook.js";

/** The env's webhooks, plus which ones have no uid (made in the dashboard) and
 * so may be adopted by URL. */
export const listSyncRemote = async ({
	appId,
}: {
	appId: string;
}): Promise<{ remote: Webhook[]; uidlessIds: Set<string> }> => {
	const endpoints = await listAllSvixEndpoints({ appId });
	return {
		remote: endpoints.map((endpoint) => svixEndpointToWebhook({ endpoint })),
		uidlessIds: new Set(
			endpoints.filter((endpoint) => !endpoint.uid).map(({ id }) => id),
		),
	};
};

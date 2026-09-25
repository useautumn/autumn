import type { Webhook } from "@autumn/shared";
import { listAllSvixEndpoints } from "@/external/svix/endpoints/listAllSvixEndpoints.js";
import { svixEndpointToWebhook } from "@/external/svix/endpoints/svixEndpointToWebhook.js";

export const listWebhooks = async ({
	appId,
}: {
	appId: string;
}): Promise<Webhook[]> => {
	const endpoints = await listAllSvixEndpoints({ appId });
	return endpoints.map((endpoint) => svixEndpointToWebhook({ endpoint }));
};

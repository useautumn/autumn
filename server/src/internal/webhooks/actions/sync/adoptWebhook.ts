import type { Webhook, WebhookParams } from "@autumn/shared";
import { svixEndpointToWebhook } from "@/external/svix/endpoints/svixEndpointToWebhook.js";
import { withSvixErrors } from "@/external/svix/endpoints/withSvixErrors.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";

/** Gives a dashboard-made endpoint our id and the stated fields. The endpoint
 * and its signing secret stay the same, so nothing new is created. */
export const adoptWebhook = async ({
	appId,
	endpointId,
	params,
}: {
	appId: string;
	endpointId: string;
	params: WebhookParams;
}): Promise<Webhook> => {
	const endpoint = await withSvixErrors({
		webhookId: params.id,
		run: () =>
			createSvixCli().endpoint.patch(appId, endpointId, {
				uid: params.id,
				url: params.url,
				filterTypes: params.events,
				description: params.description,
				disabled: params.disabled,
			}),
	});
	return svixEndpointToWebhook({ endpoint });
};

import type { UpdateWebhookParams, Webhook } from "@autumn/shared";
import { svixEndpointToWebhook } from "@/external/svix/endpoints/svixEndpointToWebhook.js";
import { withSvixErrors } from "@/external/svix/endpoints/withSvixErrors.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";

/** Patches only the stated fields; the id is the lookup key and never changes. */
export const updateWebhook = async ({
	appId,
	params,
}: {
	appId: string;
	params: UpdateWebhookParams;
}): Promise<Webhook> => {
	const { id, url, events, description, disabled } = params;
	const endpoint = await withSvixErrors({
		webhookId: id,
		run: () =>
			createSvixCli().endpoint.patch(appId, id, {
				url,
				filterTypes: events,
				description,
				disabled,
			}),
	});
	return svixEndpointToWebhook({ endpoint });
};

import type { UpdateWebhookParams, Webhook } from "@autumn/shared";
import { svixEndpointToWebhook } from "@/external/svix/endpoints/svixEndpointToWebhook.js";
import { toSvixFilterTypes } from "@/external/svix/endpoints/toSvixFilterTypes.js";
import { withSvixErrors } from "@/external/svix/endpoints/withSvixErrors.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";

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
				filterTypes: toSvixFilterTypes({ events }),
				description,
				disabled,
			}),
	});
	return svixEndpointToWebhook({ endpoint });
};

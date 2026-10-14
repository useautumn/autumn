import {
	ErrCode,
	RecaseError,
	type Webhook,
	type WebhookParams,
} from "@autumn/shared";
import { svixEndpointToWebhook } from "@/external/svix/endpoints/svixEndpointToWebhook.js";
import { toSvixFilterTypes } from "@/external/svix/endpoints/toSvixFilterTypes.js";
import { withSvixErrors } from "@/external/svix/endpoints/withSvixErrors.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";

export const adoptWebhook = async ({
	appId,
	endpointId,
	params,
}: {
	appId: string;
	endpointId: string;
	params: WebhookParams;
}): Promise<Webhook> => {
	const svix = createSvixCli();
	// Svix has no conditional update: re-read so a concurrent adoption is refused
	const current = await withSvixErrors({
		webhookId: params.id,
		run: () => svix.endpoint.get(appId, endpointId),
	});
	if (current.uid)
		throw new RecaseError({
			message: `The dashboard webhook at this URL was just given the id ${current.uid}; run the sync again`,
			code: ErrCode.AmbiguousWebhookUrl,
			statusCode: 409,
		});
	const endpoint = await withSvixErrors({
		webhookId: params.id,
		run: () =>
			svix.endpoint.patch(appId, endpointId, {
				uid: params.id,
				url: params.url,
				filterTypes: toSvixFilterTypes({ events: params.events }),
				description: params.description,
				disabled: params.disabled,
			}),
	});
	return svixEndpointToWebhook({ endpoint });
};

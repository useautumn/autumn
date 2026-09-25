import {
	ErrCode,
	RecaseError,
	type Webhook,
	type WebhookParams,
} from "@autumn/shared";
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
	const svix = createSvixCli();
	// Svix has no conditional update: re-read so a concurrent adoption is refused
	// rather than overwritten. This narrows the race; it can't close it.
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
				filterTypes: params.events,
				description: params.description,
				disabled: params.disabled,
			}),
	});
	return svixEndpointToWebhook({ endpoint });
};

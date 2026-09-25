import type { Webhook, WebhookParams } from "@autumn/shared";
import { svixEndpointToWebhook } from "@/external/svix/endpoints/svixEndpointToWebhook.js";
import { withSvixErrors } from "@/external/svix/endpoints/withSvixErrors.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";

/** Svix's create never returns the signing secret, so it's read right after. */
export const createWebhook = async ({
	appId,
	params,
}: {
	appId: string;
	params: WebhookParams;
}): Promise<{ webhook: Webhook; secret: string }> => {
	const svix = createSvixCli();
	const endpoint = await withSvixErrors({
		webhookId: params.id,
		run: () =>
			svix.endpoint.create(appId, {
				uid: params.id,
				url: params.url,
				filterTypes: params.events,
				description: params.description,
				disabled: params.disabled,
			}),
	});
	try {
		const { key } = await svix.endpoint.getSecret(appId, endpoint.id);
		return { webhook: svixEndpointToWebhook({ endpoint }), secret: key };
	} catch (error) {
		// Without its secret the webhook can't be verified: undo it so a retry
		// creates it again rather than hitting a duplicate id.
		await svix.endpoint.delete(appId, endpoint.id).catch(() => {});
		throw error;
	}
};

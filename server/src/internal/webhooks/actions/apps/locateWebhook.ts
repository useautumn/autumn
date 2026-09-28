import { ErrCode, RecaseError } from "@autumn/shared";
import { ApiException, type EndpointOut } from "svix";
import { createSvixCli } from "@/external/svix/svixUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { listWebhookApps, type WebhookApp } from "./webhookApps.js";

const isNotFound = (error: unknown) =>
	error instanceof ApiException && error.code === 404;

/** The app holding this id, and its endpoint; null when neither app has it. */
export const findWebhook = async ({
	ctx,
	id,
}: {
	ctx: AutumnContext;
	id: string;
}): Promise<(WebhookApp & { endpoint: EndpointOut }) | null> => {
	const svix = createSvixCli();
	for (const app of await listWebhookApps({ ctx })) {
		try {
			return { ...app, endpoint: await svix.endpoint.get(app.appId, id) };
		} catch (error) {
			if (!isNotFound(error)) throw error;
		}
	}
	return null;
};

export const locateWebhook = async ({
	ctx,
	id,
}: {
	ctx: AutumnContext;
	id: string;
}): Promise<WebhookApp & { endpoint: EndpointOut }> => {
	const found = await findWebhook({ ctx, id });
	if (found) return found;
	throw new RecaseError({
		message: `Webhook ${id} not found`,
		code: ErrCode.WebhookNotFound,
		statusCode: 404,
	});
};

import { AuthType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createStripeCli } from "../connect/createStripeCli.js";
import { processStripeWebhookEvent } from "./handleStripeWebhookEvent.js";
import type { StripeWebhookQueuePayload } from "./stripeWebhookQueue.js";
import {
	enrichStripeWebhookLogger,
	logStripeWebhookRequest,
	logStripeWebhookResponse,
} from "./webhookMiddlewares/stripeLoggerMiddleware.js";
import { syncStripeWebhookEvent } from "./webhookMiddlewares/stripeSyncMiddleware.js";
import { getStripeWebhookContextWithCustomer } from "./webhookMiddlewares/stripeToAutumnCustomerMiddleware.js";
import type { StripeWebhookContext } from "./webhookMiddlewares/stripeWebhookContext.js";
import { refreshStripeWebhookCustomerCache } from "./webhookMiddlewares/stripeWebhookRefreshMiddleware.js";

export const processQueuedStripeWebhook = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: StripeWebhookQueuePayload;
}) => {
	let stripeCtx: StripeWebhookContext = {
		...ctx,
		authType: AuthType.Stripe,
		timestamp: payload.receivedAtMs,
		stripeEvent: payload.event,
		stripeCli: createStripeCli({ org: ctx.org, env: ctx.env }),
		ingressSubscriptionLock: payload.ingressSubscriptionLock,
	};
	stripeCtx = await getStripeWebhookContextWithCustomer({ ctx: stripeCtx });
	enrichStripeWebhookLogger({ ctx: stripeCtx });
	logStripeWebhookRequest({ ctx: stripeCtx });

	try {
		await processStripeWebhookEvent({ ctx: stripeCtx });
		void syncStripeWebhookEvent({ ctx: stripeCtx });
		await refreshStripeWebhookCustomerCache({ ctx: stripeCtx });
		logStripeWebhookResponse({ ctx: stripeCtx, statusCode: 200 });
	} catch (error) {
		logStripeWebhookResponse({ ctx: stripeCtx, statusCode: 500 });
		throw error;
	}
};

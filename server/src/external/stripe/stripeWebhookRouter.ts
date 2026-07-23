import { Hono } from "hono";
import { queueStripeWebhook } from "./stripeWebhookQueue.js";
import { stripeConnectSeederMiddleware } from "./webhookMiddlewares/stripeConnectSeederMiddleware.js";
import { stripeLegacySeederMiddleware } from "./webhookMiddlewares/stripeLegacySeederMiddleware.js";
import type { StripeWebhookHonoEnv } from "./webhookMiddlewares/stripeWebhookContext.js";

export const stripeWebhookRouter = new Hono<StripeWebhookHonoEnv>();

// Legacy webhook - for orgs that pasted their Stripe secret keys
stripeWebhookRouter.post(
	"/webhooks/stripe/:orgId/:env",
	stripeLegacySeederMiddleware,
	queueStripeWebhook,
);

// Connect webhook - for orgs using Stripe Connect (our managed account)
stripeWebhookRouter.post(
	"/webhooks/connect/:env",
	stripeConnectSeederMiddleware,
	queueStripeWebhook,
);

import { Hono } from "hono";
import { handleStripeWebhookEvent } from "./handleStripeWebhookEvent.js";
import { stripeConnectSeederMiddleware } from "./webhookMiddlewares/stripeConnectSeederMiddleware.js";
import { stripeInitLoggerMiddleware } from "./webhookMiddlewares/stripeInitLoggerMiddleware.js";
import { stripeLegacySeederMiddleware } from "./webhookMiddlewares/stripeLegacySeederMiddleware.js";
import { stripeToCustomerIdMiddleware } from "./webhookMiddlewares/stripeToCustomerIdMiddleware.js";
import type { StripeWebhookHonoEnv } from "./webhookMiddlewares/stripeWebhookContext.js";
import { stripeWebhookRefreshMiddleware } from "./webhookMiddlewares/stripeWebhookRefreshMiddleware.js";

export const stripeWebhookRouter = new Hono<StripeWebhookHonoEnv>();

// Legacy webhook - for orgs that pasted their Stripe secret keys
stripeWebhookRouter.post(
	"/webhooks/stripe/:orgId/:env",
	stripeLegacySeederMiddleware,
	stripeWebhookRefreshMiddleware,
	stripeToCustomerIdMiddleware,
	stripeInitLoggerMiddleware,
	handleStripeWebhookEvent,
);

// Connect webhook - for orgs using Stripe Connect (our managed account)
stripeWebhookRouter.post(
	"/webhooks/connect/:env",
	stripeConnectSeederMiddleware,
	stripeWebhookRefreshMiddleware,
	stripeToCustomerIdMiddleware,
	stripeInitLoggerMiddleware,
	handleStripeWebhookEvent,
);

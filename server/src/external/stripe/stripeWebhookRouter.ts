import { Hono } from "hono";
import { stripeLoggerMiddleware } from "@/external/stripe/webhookMiddlewares/stripeLoggerMiddleware.js";
import { handleStripeWebhookEvent } from "./handleStripeWebhookEvent.js";
import { stripeConnectSeederMiddleware } from "./webhookMiddlewares/stripeConnectSeederMiddleware.js";
import { stripeIdempotencyMiddleware } from "./webhookMiddlewares/stripeIdempotencyMiddleware.js";
import { stripeLegacySeederMiddleware } from "./webhookMiddlewares/stripeLegacySeederMiddleware.js";
import { stripeToAutumnCustomerMiddleware } from "./webhookMiddlewares/stripeToAutumnCustomerMiddleware.js";
import type { StripeWebhookHonoEnv } from "./webhookMiddlewares/stripeWebhookContext.js";
import { stripeWebhookRefreshMiddleware } from "./webhookMiddlewares/stripeWebhookRefreshMiddleware.js";

export const stripeWebhookRouter = new Hono<StripeWebhookHonoEnv>();

// Legacy webhook - for orgs that pasted their Stripe secret keys
stripeWebhookRouter.post(
	"/webhooks/stripe/:orgId/:env",
	stripeLegacySeederMiddleware,
	stripeWebhookRefreshMiddleware,
	stripeToAutumnCustomerMiddleware,
	stripeLoggerMiddleware,
	stripeIdempotencyMiddleware,
	handleStripeWebhookEvent,
);

// Connect webhook - for orgs using Stripe Connect (our managed account)
stripeWebhookRouter.post(
	"/webhooks/connect/:env",
	stripeConnectSeederMiddleware,
	stripeWebhookRefreshMiddleware,
	stripeToAutumnCustomerMiddleware,
	stripeLoggerMiddleware,
	stripeIdempotencyMiddleware,
	handleStripeWebhookEvent,
);

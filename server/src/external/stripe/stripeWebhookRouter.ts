import { Hono } from "hono";
import { withTwStripeWebhookPriority } from "@/external/connect/clientCache/twStripeLimiter/twStripeRequestContext";
import { stripeLoggerMiddleware } from "@/external/stripe/webhookMiddlewares/stripeLoggerMiddleware.js";
import { traceEnrichMiddleware } from "@/honoMiddlewares/traceMiddleware.js";
import { handleStripeWebhookEvent } from "./handleStripeWebhookEvent.js";
import { stripeConnectSeederMiddleware } from "./webhookMiddlewares/stripeConnectSeederMiddleware.js";
import { stripeIdempotencyMiddleware } from "./webhookMiddlewares/stripeIdempotencyMiddleware.js";
import { stripeLegacySeederMiddleware } from "./webhookMiddlewares/stripeLegacySeederMiddleware.js";
import { stripeSyncMiddleware } from "./webhookMiddlewares/stripeSyncMiddleware.js";
import { stripeToAutumnCustomerMiddleware } from "./webhookMiddlewares/stripeToAutumnCustomerMiddleware.js";
import { stripeWebhookAckMiddleware } from "./webhookMiddlewares/stripeWebhookAckMiddleware.js";
import type { StripeWebhookHonoEnv } from "./webhookMiddlewares/stripeWebhookContext.js";
import { stripeWebhookRefreshMiddleware } from "./webhookMiddlewares/stripeWebhookRefreshMiddleware.js";

export const stripeWebhookRouter = new Hono<StripeWebhookHonoEnv>();

stripeWebhookRouter.use("/webhooks/*", (_c, next) =>
	withTwStripeWebhookPriority(next),
);

stripeWebhookRouter.post(
	"/webhooks/stripe/:orgId/:env",
	stripeLegacySeederMiddleware,
	stripeToAutumnCustomerMiddleware,
	stripeIdempotencyMiddleware,
	stripeWebhookAckMiddleware,
	stripeWebhookRefreshMiddleware,
	stripeSyncMiddleware,
	stripeLoggerMiddleware,
	traceEnrichMiddleware,
	handleStripeWebhookEvent,
);

stripeWebhookRouter.post(
	"/webhooks/connect/:env",
	stripeConnectSeederMiddleware,
	stripeToAutumnCustomerMiddleware,
	stripeIdempotencyMiddleware,
	stripeWebhookAckMiddleware,
	stripeWebhookRefreshMiddleware,
	stripeSyncMiddleware,
	stripeLoggerMiddleware,
	traceEnrichMiddleware,
	handleStripeWebhookEvent,
);

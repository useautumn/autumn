import * as Sentry from "@sentry/bun";
import type { Context } from "hono";
import { Stripe } from "stripe";

import { handleStripeInvoicePaid } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/handleStripeInvoicePaid.js";
import { handleStripeSubscriptionUpdated } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/handleStripeSubscriptionUpdated.js";
import { unsetOrgStripeKeys } from "@/internal/orgs/orgUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { handleWebhookErrorSkip } from "@/utils/routerUtils/webhookErrorSkip.js";
import { getSentryTags } from "../sentry/sentryUtils.js";
import { handleCusDiscountDeleted } from "./webhookHandlers/handleCusDiscountDeleted.js";
import { handleInvoiceFinalized } from "./webhookHandlers/handleInvoiceFinalized.js";
import { handleInvoiceUpdated } from "./webhookHandlers/handleInvoiceUpdated.js";
import { handleStripeCheckoutSessionCompleted } from "./webhookHandlers/handleStripeCheckoutSessionCompleted/handleStripeCheckoutSessionCompleted.js";
import { handleStripeInvoiceCreated } from "./webhookHandlers/handleStripeInvoiceCreated/handleStripeInvoiceCreated.js";
import { handleStripeSubscriptionDeleted } from "./webhookHandlers/handleStripeSubscriptionDeleted/handleStripeSubscriptionDeleted.js";
import { handleSubCreated } from "./webhookHandlers/handleSubCreated.js";
import { handleSubscriptionScheduleCanceled } from "./webhookHandlers/handleSubScheduleCanceled.js";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "./webhookMiddlewares/stripeWebhookContext.js";

/**
 * Hono handler for Stripe webhook events
 * Context is set up by seeder middlewares (legacy or connect)
 */
export const handleStripeWebhookEvent = async (
	c: Context<StripeWebhookHonoEnv>,
) => {
	const ctx = c.get("ctx") as StripeWebhookContext;
	const { db, logger, org, env, stripeEvent } = ctx;
	const event = stripeEvent;

	try {
		switch (event.type) {
			case "customer.subscription.created":
				await handleSubCreated({ ctx });
				break;

			case "customer.subscription.updated":
				await handleStripeSubscriptionUpdated({ ctx, event });
				break;

			case "customer.subscription.deleted":
				await handleStripeSubscriptionDeleted({ ctx, event });
				break;

			case "invoice.paid":
				await handleStripeInvoicePaid({ ctx, event });
				break;

			case "invoice.updated":
				await handleInvoiceUpdated({
					event,
					req: ctx as unknown as ExtendedRequest,
				});
				break;

			case "invoice.created":
				await handleStripeInvoiceCreated({ ctx, event });
				break;

			case "invoice.finalized": {
				await handleInvoiceFinalized({ ctx });
				break;
			}

			case "subscription_schedule.canceled": {
				const canceledSchedule = event.data.object;
				await handleSubscriptionScheduleCanceled({
					db,
					org,
					env,
					schedule: canceledSchedule,
				});
				break;
			}

			case "customer.discount.deleted":
				await handleCusDiscountDeleted({ ctx });
				break;

			case "checkout.session.completed": {
				await handleStripeCheckoutSessionCompleted({ ctx, event });
				break;
			}
		}
	} catch (error) {
		Sentry.captureException(error, {
			tags: getSentryTags({
				ctx,
				method: event.type,
			}),
		});

		if (error instanceof Stripe.errors.StripeError) {
			if (error.message.includes("No such customer")) {
				logger.warn(`stripe customer missing: ${error.message}`);
				return c.json({ success: true }, 200);
			}

			if (error.message.includes("Expired API Key provided")) {
				await unsetOrgStripeKeys({
					db,
					org,
					env,
				});

				return c.json({ success: true }, 200);
			}
		}

		if (
			process.env.NODE_ENV === "development" &&
			error instanceof Error &&
			error.message.includes("No stripe account linked to organization")
		) {
			return c.json({ success: true }, 200);
		}

		const shouldSkip = handleWebhookErrorSkip({ error, logger });
		if (!shouldSkip) {
			logger.error(`Stripe webhook error: ${error}`, { error });
		}
		return c.json({ message: "Webhook received, internal server error" }, 200);
	}

	// Note: Cache refresh is now handled by stripeWebhookRefreshMiddleware

	return c.json({ success: true }, 200);
};

import * as Sentry from "@sentry/bun";
import type { Context } from "hono";
import { Stripe } from "stripe";

import { unsetOrgStripeKeys } from "@/internal/orgs/orgUtils.js";
import { handleWebhookErrorSkip } from "@/utils/routerUtils/webhookErrorSkip.js";
import { getSentryTags } from "../sentry/sentryUtils.js";
import { runStripeWebhookHandlers } from "./runStripeWebhookHandlers.js";
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
		await runStripeWebhookHandlers({ ctx });
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
		if (shouldSkip) {
			return c.json({ message: "Webhook received, skipped known error" }, 200);
		}

		logger.error(`Stripe webhook error: ${error}`, { error });
		// Rethrow so the ack middleware owns the outcome: sync events 500 (Stripe
		// retries), early events release the idempotency lock for manual replay.
		throw error;
	}

	// Note: Cache refresh is now handled by stripeWebhookRefreshMiddleware

	return c.json({ success: true }, 200);
};

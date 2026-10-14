import type { Context } from "hono";
import { Stripe } from "stripe";

import { unsetOrgStripeKeys } from "@/internal/orgs/orgUtils.js";
import { handleWebhookErrorSkip } from "@/utils/routerUtils/webhookErrorSkip.js";
import { runStripeWebhookHandlers } from "./runStripeWebhookHandlers.js";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "./webhookMiddlewares/stripeWebhookContext.js";

export const handleStripeWebhookEvent = async (
	c: Context<StripeWebhookHonoEnv>,
) => {
	const ctx = c.get("ctx") as StripeWebhookContext;
	const { db, logger, org, env } = ctx;

	try {
		await runStripeWebhookHandlers({ ctx });
	} catch (error) {
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
		throw error;
	}

	return c.json({ success: true }, 200);
};

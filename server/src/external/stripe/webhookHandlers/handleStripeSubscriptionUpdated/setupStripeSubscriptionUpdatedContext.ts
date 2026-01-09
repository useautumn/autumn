import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription.js";
import { stripeSubscriptionToNowMs } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import type {
	StripeSubscriptionUpdatedContext,
	SubscriptionPreviousAttributes,
} from "./stripeSubscriptionUpdatedContext.js";

export const setupStripeSubscriptionUpdatedContext = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}): Promise<StripeSubscriptionUpdatedContext | null> => {
	const { stripeEvent, fullCustomer, org, env } = ctx;

	if (!fullCustomer) {
		ctx.logger.warn("[sub.updated] fullCustomer not found, skipping");
		return null;
	}

	const stripeSubscription = await getExpandedStripeSubscription({
		ctx,
		subscriptionId: (stripeEvent.data.object as Stripe.Subscription).id,
	});

	const previousAttributes = stripeEvent.data
		.previous_attributes as SubscriptionPreviousAttributes;

	// Get current time (respecting test clocks)
	const stripeCli = createStripeCli({ org, env });
	const nowMs = await stripeSubscriptionToNowMs({
		stripeSubscription,
		stripeCli,
	});

	return {
		stripeSubscription,
		previousAttributes,
		fullCustomer,
		customerProducts: [...fullCustomer.customer_products],
		nowMs,
		updatedCustomerProducts: [],
	};
};

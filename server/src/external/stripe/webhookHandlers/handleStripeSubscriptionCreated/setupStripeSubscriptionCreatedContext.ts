import type { FullCustomer, FullProduct } from "@autumn/shared";
import type Stripe from "stripe";
import { ProductService } from "@/internal/products/ProductService.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { shouldSkipSubscriptionSync } from "../common/subscriptionSync/shouldSkipSubscriptionSync.js";

export type StripeSubscriptionCreatedContext = {
	subscription: Stripe.Subscription;
	fullCustomer: FullCustomer;
	candidateProducts: FullProduct[];
};

export const setupStripeSubscriptionCreatedContext = async ({
	ctx,
	subscription,
}: {
	ctx: StripeWebhookContext;
	subscription: Stripe.Subscription;
}): Promise<StripeSubscriptionCreatedContext | undefined> => {
	const { db, org, env, fullCustomer, logger } = ctx;

	// No auto-provisioning — only sync subs for customers already in Autumn.
	if (!fullCustomer) return undefined;

	const candidateProducts = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
	});

	const skip = shouldSkipSubscriptionSync({ subscription, fullCustomer });
	if (skip.skip) {
		logger.info(
			`sub.created auto-sync: skipping stripe sub ${subscription.id} (${skip.reason})`,
		);
		return undefined;
	}

	return { subscription, fullCustomer, candidateProducts };
};

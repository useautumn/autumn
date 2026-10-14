import type { FullCustomer, FullProduct } from "@autumn/shared";
import type Stripe from "stripe";
import { ProductService } from "@/internal/products/ProductService.js";
import { getFullStripeSub } from "../../stripeSubUtils.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";

export type StripeSubscriptionCreatedContext = {
	subscription: Stripe.Subscription;
	fullCustomer: FullCustomer;
	candidateProducts: FullProduct[];
};

export const setupStripeSubscriptionCreatedContext = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}): Promise<StripeSubscriptionCreatedContext | undefined> => {
	const { db, org, env, fullCustomer, stripeCli, stripeEvent } = ctx;
	const stripeObject = stripeEvent.data.object as Stripe.Subscription;

	if (!fullCustomer) return undefined;

	const [subscription, candidateProducts] = await Promise.all([
		getFullStripeSub({ stripeCli, stripeId: stripeObject.id }),
		ProductService.listFull({ db, orgId: org.id, env }),
	]);

	return { subscription, fullCustomer, candidateProducts };
};

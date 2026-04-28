import type { FullCustomer, FullProduct } from "@autumn/shared";
import type Stripe from "stripe";
import { ProductService } from "@/internal/products/ProductService.js";
import { getFullStripeSub } from "../../stripeSubUtils.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";

export type SubCreatedContext = {
	subscription: Stripe.Subscription;
	fullCustomer: FullCustomer;
	candidateProducts: FullProduct[];
};

export const setupSubCreatedContext = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}): Promise<SubCreatedContext | undefined> => {
	const { db, org, env, fullCustomer, stripeCli, stripeEvent } = ctx;
	const stripeObject = stripeEvent.data.object as Stripe.Subscription;

	// No auto-provisioning — only sync subs for customers already in Autumn.
	if (!fullCustomer) return undefined;

	// Skip if Autumn already linked this sub (e.g. created via attach flow).
	const alreadyLinked = fullCustomer.customer_products?.some((cp) =>
		cp.subscription_ids?.includes(stripeObject.id),
	);
	if (alreadyLinked) return undefined;

	const [subscription, candidateProducts] = await Promise.all([
		getFullStripeSub({ stripeCli, stripeId: stripeObject.id }),
		ProductService.listFull({ db, orgId: org.id, env }),
	]);

	// Skip subs Autumn created itself — guards against the race where the
	// attach flow has not yet written `subscription_ids` on the cusProduct
	// when sub.created arrives.
	if (subscription.metadata?.autumn_managed === "true") return undefined;

	return { subscription, fullCustomer, candidateProducts };
};

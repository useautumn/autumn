import type { SyncMappingV0 } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { sync } from "@/internal/billing/v2/actions/sync/sync.js";
import { findAutumnProductsForSubscription } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeToAutumn/findAutumnProductsForSubscription.js";
import type { SubCreatedContext } from "../setupSubCreatedContext.js";

export const autoSyncFromSubscription = async ({
	ctx,
	subCreatedContext,
}: {
	ctx: StripeWebhookContext;
	subCreatedContext: SubCreatedContext;
}) => {
	const { logger } = ctx;
	const { subscription, fullCustomer, candidateProducts } = subCreatedContext;

	const matchedProducts = findAutumnProductsForSubscription({
		stripeSubscription: subscription,
		products: candidateProducts,
	});

	if (matchedProducts.length === 0) {
		logger.info(
			`sub.created auto-sync: no Autumn product matched stripe sub ${subscription.id}, skipping`,
		);
		return;
	}

	if (matchedProducts.length > 1) {
		logger.warn(
			`sub.created auto-sync: stripe sub ${subscription.id} matched ${matchedProducts.length} Autumn products (${matchedProducts
				.map((product) => product.id)
				.join(
					", ",
				)}); skipping due to ambiguity. Check for overlapping stripe price IDs across products.`,
		);
		return;
	}

	const [matchedProduct] = matchedProducts;
	const mappings: SyncMappingV0[] = [
		{
			stripe_subscription_id: subscription.id,
			plan_id: matchedProduct.id,
		},
	];

	await sync({
		ctx,
		params: {
			customer_id: fullCustomer.id ?? fullCustomer.internal_id,
			mappings,
		},
	});
};

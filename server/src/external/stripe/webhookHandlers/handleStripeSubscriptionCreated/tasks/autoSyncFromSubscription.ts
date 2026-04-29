import type { SyncMappingV0 } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { sync } from "@/internal/billing/v2/actions/sync/sync.js";
import { findAutumnProductsForSubscription } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeToAutumn/findAutumnProductsForSubscription.js";
import { subscriptionToPrepaidFeatureOptions } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeToAutumn/subscriptionToFeatureOptions.js";
import type { StripeSubscriptionCreatedContext } from "../setupStripeSubscriptionCreatedContext.js";

export const autoSyncFromSubscription = async ({
	ctx,
	subscriptionCreatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionCreatedContext: StripeSubscriptionCreatedContext;
}) => {
	const { logger } = ctx;
	const { subscription, fullCustomer, candidateProducts } =
		subscriptionCreatedContext;

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
	const prepaidFeatureOptions = subscriptionToPrepaidFeatureOptions({
		ctx,
		stripeSubscription: subscription,
		matchedProduct,
	});

	const mappings: SyncMappingV0[] = [
		{
			stripe_subscription_id: subscription.id,
			plan_id: matchedProduct.id,
			prepaid_feature_options: prepaidFeatureOptions,
			expire_previous: true,
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

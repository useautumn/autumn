import type Stripe from "stripe";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { expireAbandonedCheckoutCustomerProducts } from "@/internal/billing/v2/execute/pendingCustomerProducts/expireAbandonedCheckoutCustomerProducts";
import { LONG_LIVED_CHECKOUT_STRIPE_METADATA_KEY } from "@/internal/billing/v2/providers/stripe/execute/executeStripeCheckoutSessionAction";

/**
 * checkout.session.expired handler — expires what an abandoned checkout granted:
 * enable_plan_immediately rows linked by session, or pending rows linked by metadata.
 */
export const handleStripeCheckoutSessionExpired = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.CheckoutSessionExpiredEvent;
}) => {
	const session = event.data.object;

	// Long-lived links keep their grant until the link expires (see runLongLivedCheckoutExpiry).
	if (session.metadata?.[LONG_LIVED_CHECKOUT_STRIPE_METADATA_KEY]) return;

	await expireAbandonedCheckoutCustomerProducts({
		ctx,
		stripeCheckoutSessionId: session.id,
		metadataId: session.metadata?.autumn_metadata_id,
	});

	ctx.logger.info(
		`[checkout.session.expired] Expired customer products granted by ${session.id}`,
	);
};

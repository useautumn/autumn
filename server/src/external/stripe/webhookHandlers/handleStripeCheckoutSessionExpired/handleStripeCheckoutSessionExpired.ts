import { CusProductStatus } from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import {
	expireCustomerProducts,
	expirePendingCustomerProducts,
} from "@/internal/billing/v2/execute/expirePendingCustomerProducts";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

/**
 * checkout.session.expired handler — cleans up cusProduct rows that were
 * pre-inserted under the enable_plan_immediately flow but never got their
 * subscription linked because the customer abandoned the checkout.
 *
 * Identifies rows by stripe_checkout_session_id. Skips any row that has
 * subscription_ids populated (already completed via the success path).
 */
export const handleStripeCheckoutSessionExpired = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.CheckoutSessionExpiredEvent;
}) => {
	const session = event.data.object;

	const cusProducts = await CusProductService.getByStripeCheckoutSessionId({
		db: ctx.db,
		stripeCheckoutSessionId: session.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	if (cusProducts.length === 0) {
		// Try to clean up the metadata row even if no cusProduct ever got created
		// (e.g. a deferred-flow checkout that expired).
		if (session.metadata?.autumn_metadata_id) {
			await expirePendingCustomerProducts({
				ctx,
				metadataId: session.metadata.autumn_metadata_id,
			});
			await MetadataService.delete({
				db: ctx.db,
				id: session.metadata.autumn_metadata_id,
			});
		}
		return;
	}

	await expireCustomerProducts({
		ctx,
		customerProducts: cusProducts,
		skipSubscriptionLinked: true,
	});

	if (session.metadata?.autumn_metadata_id) {
		await MetadataService.delete({
			db: ctx.db,
			id: session.metadata.autumn_metadata_id,
		});
	}

	ctx.logger.info(
		`[checkout.session.expired] Expired ${cusProducts.length} cusProduct(s) linked to ${session.id}`,
	);
};

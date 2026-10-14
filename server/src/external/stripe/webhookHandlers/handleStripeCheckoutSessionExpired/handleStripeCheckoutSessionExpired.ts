import { CusProductStatus } from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import {
	expireCustomerProducts,
	expirePendingCustomerProducts,
} from "@/internal/billing/v2/execute/pendingCustomerProducts/expirePendingCustomerProducts";
import { LONG_LIVED_CHECKOUT_STRIPE_METADATA_KEY } from "@/internal/billing/v2/providers/stripe/execute/executeStripeCheckoutSessionAction";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

export const handleStripeCheckoutSessionExpired = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.CheckoutSessionExpiredEvent;
}) => {
	const session = event.data.object;

	if (session.metadata?.[LONG_LIVED_CHECKOUT_STRIPE_METADATA_KEY]) return;

	const cusProducts = await CusProductService.getByStripeCheckoutSessionId({
		db: ctx.db,
		stripeCheckoutSessionId: session.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	if (cusProducts.length === 0) {
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

	const abandonedCusProducts = cusProducts.filter(
		(cusProduct) => (cusProduct.subscription_ids ?? []).length === 0,
	);

	await expireCustomerProducts({
		ctx,
		customerProducts: abandonedCusProducts,
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

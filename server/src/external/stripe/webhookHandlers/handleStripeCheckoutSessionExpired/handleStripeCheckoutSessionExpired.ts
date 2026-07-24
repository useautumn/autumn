import {
	CheckoutStatus,
	CusProductStatus,
	type DeferredAutumnBillingPlanData,
	MetadataType,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { checkoutRepo } from "@/internal/checkouts";
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
	const metadataId = session.metadata?.autumn_metadata_id;
	const metadata = metadataId
		? await MetadataService.get({ db: ctx.db, id: metadataId })
		: null;

	const cusProducts = await CusProductService.getByStripeCheckoutSessionId({
		db: ctx.db,
		stripeCheckoutSessionId: session.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const deferredData = metadata?.data as
		| DeferredAutumnBillingPlanData
		| undefined;
	const longLivedCheckoutId = deferredData?.billingContext.longLivedCheckoutId;
	const longLivedCheckout = longLivedCheckoutId
		? await checkoutRepo.get({ db: ctx.db, id: longLivedCheckoutId })
		: null;
	const preserveProducts =
		(metadata?.type === MetadataType.CheckoutSessionEnabledImmediately ||
			metadata?.type ===
				MetadataType.CheckoutSessionEnabledImmediatelyProcessing) &&
		longLivedCheckout?.status === CheckoutStatus.Pending &&
		longLivedCheckout.expires_at > Date.now() &&
		cusProducts.length > 0;

	if (preserveProducts) {
		ctx.logger.info(
			`[checkout.session.expired] Preserved ${cusProducts.length} cusProduct(s) for long-lived checkout ${longLivedCheckoutId}`,
		);
		return;
	}

	if (cusProducts.length === 0) {
		if (metadataId) {
			await MetadataService.delete({
				db: ctx.db,
				id: metadataId,
			});
		}
		return;
	}

	const now = Date.now();

	for (const cusProduct of cusProducts) {
		if ((cusProduct.subscription_ids ?? []).length > 0) continue;

		await CusProductService.update({
			ctx,
			cusProductId: cusProduct.id,
			updates: {
				status: CusProductStatus.Expired,
				ended_at: now,
			},
		});
	}

	if (metadataId) {
		await MetadataService.delete({
			db: ctx.db,
			id: metadataId,
		});
	}

	ctx.logger.info(
		`[checkout.session.expired] Expired ${cusProducts.length} cusProduct(s) linked to ${session.id}`,
	);
};

import type Stripe from "stripe";
import { upsertAutumnInvoice } from "@/external/stripe/webhookHandlers/common/upsertAutumnInvoice";
import { convertToChargeAutomatically } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/convertToChargeAutomatically.js";
import { queueCheckoutRewardTasks } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/queueCheckoutRewardTasks.js";
import { sendEmailReceipt } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/sendEmailReceipt.js";
import { autoTopupLimitRepo } from "@/internal/balances/autoTopUp/repos";
import { customerProductActions } from "@/internal/customers/cusProducts/actions/index.js";
import type { StripeWebhookContext } from "../../webhookMiddlewares/stripeWebhookContext.js";
import { setupStripeInvoicePaidContext } from "./setupStripeInvoicePaidContext.js";
import { handleStripeInvoiceDiscounts } from "./tasks/handleStripeInvoiceDiscounts.js";
import { handleStripeInvoiceMetadata } from "./tasks/handleStripeInvoiceMetadata/handleStripeInvoiceMetadata.js";

export const handleStripeInvoicePaid = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.InvoicePaidEvent;
}) => {
	const invoicePaidContext = await setupStripeInvoicePaidContext({
		ctx,
		event,
	});

	if (!invoicePaidContext) {
		ctx.logger.warn("[invoice.paid] invoicePaidContext not found, skipping");
		return;
	}

	if (
		invoicePaidContext.stripeInvoice.metadata?.autumn_action_source ===
			"threshold_billing" &&
		ctx.fullCustomer
	) {
		for (const customerProduct of ctx.fullCustomer.customer_products) {
			const thresholdProduct = customerProduct.customer_prices.some(
				(customerPrice) =>
					"threshold_billing" in customerPrice.price.config &&
					customerProduct.status === "past_due",
			);
			if (thresholdProduct) {
				await customerProductActions.markActive({
					ctx,
					customerProduct,
					fullCustomer: ctx.fullCustomer,
				});
			}
		}
	}

	ctx.logger.debug(
		`Received invoice.paid event for invoice ${invoicePaidContext.stripeInvoice.id}`,
	);

	// 1. Handle metadata-based payments (deferred billing, checkout, etc.)
	await handleStripeInvoiceMetadata({ ctx, invoicePaidContext });

	// 2. Handle discount/coupon rollover
	await handleStripeInvoiceDiscounts({ ctx, invoicePaidContext });

	// 3. Upsert Autumn invoice (uses invoice from context - already expanded)
	await upsertAutumnInvoice({
		ctx,
		stripeInvoice: invoicePaidContext.stripeInvoice,
		stripeSubscription: invoicePaidContext.stripeSubscription,
		customerProducts: invoicePaidContext.customerProducts,
	});

	if (invoicePaidContext.stripeSubscriptionId) {
		await convertToChargeAutomatically({ ctx, invoicePaidContext });

		// 3c. Trigger checkout rewards
		await queueCheckoutRewardTasks({ ctx, invoicePaidContext });
	}

	// 4. Send email receipt
	await sendEmailReceipt({ ctx, invoicePaidContext });

	// 5. A successful payment clears any auto top-up suspension
	if (ctx.fullCustomer) {
		const cleared = await autoTopupLimitRepo.clearSuspensions({
			ctx,
			internalCustomerId: ctx.fullCustomer.internal_id,
		});

		if (cleared > 0) {
			ctx.logger.info(
				`[invoice.paid] Cleared ${cleared} auto top-up suspension(s) for customer ${ctx.fullCustomer.id}`,
			);
		}
	}
};

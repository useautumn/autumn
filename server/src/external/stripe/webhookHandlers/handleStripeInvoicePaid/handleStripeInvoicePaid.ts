import type Stripe from "stripe";
import { upsertAutumnInvoice } from "@/external/stripe/webhookHandlers/common/upsertAutumnInvoice";
import { convertToChargeAutomatically } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/convertToChargeAutomatically.js";
import { queueCheckoutRewardTasks } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/queueCheckoutRewardTasks.js";
import { sendEmailReceipt } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/sendEmailReceipt.js";
import { autoTopupLimitRepo } from "@/internal/balances/autoTopUp/repos";
import { clearThresholdPastDue } from "@/internal/balances/thresholdBilling/clearThresholdPastDue.js";
import { AUTUMN_ACTION_CUSTOMER_PRODUCT_METADATA_KEY } from "@/internal/billing/v2/providers/stripe/utils/invoices/billingInvoiceMetadataKeys.js";
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

	const isThresholdBillingInvoice =
		invoicePaidContext.stripeInvoice.metadata?.autumn_action_source ===
		"threshold_billing";

	if (isThresholdBillingInvoice && ctx.fullCustomer) {
		invoicePaidContext.results.updatedCustomerProductIds =
			await clearThresholdPastDue({
				ctx,
				fullCustomer: ctx.fullCustomer,
				customerProductId:
					invoicePaidContext.stripeInvoice.metadata?.[
						AUTUMN_ACTION_CUSTOMER_PRODUCT_METADATA_KEY
					] ?? undefined,
			});
	}

	ctx.logger.debug(
		`Received invoice.paid event for invoice ${invoicePaidContext.stripeInvoice.id}`,
	);

	// 1. Handle metadata-based payments (deferred billing, checkout, etc.)
	await handleStripeInvoiceMetadata({ ctx, invoicePaidContext });

	// 2. Handle discount/coupon rollover
	await handleStripeInvoiceDiscounts({ ctx, invoicePaidContext });

	// 3. Upsert Autumn invoice (uses invoice from context - already expanded)
	const invoiceResult = await upsertAutumnInvoice({
		ctx,
		stripeInvoice: invoicePaidContext.stripeInvoice,
		stripeSubscription: invoicePaidContext.stripeSubscription,
		customerProducts: invoicePaidContext.customerProducts,
	});
	invoicePaidContext.results.invoiceCache = invoiceResult?.cacheResult ?? null;

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

	ctx.handlerResult = { type: "invoice.paid", context: invoicePaidContext };
};

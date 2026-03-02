import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import {
	submitBillingDataToVercel,
	submitInvoiceToVercel,
} from "@/external/vercel/misc/vercelInvoicing";
import { logVercelWebhook } from "@/external/vercel/misc/vercelMiddleware";
import { ProductService } from "@/internal/products/ProductService";
import type { InvoiceFinalizedContext } from "../setupInvoiceFinalizedContext";

/**
 * Handles Vercel custom payment method invoices.
 * Submits billing data and invoice to Vercel marketplace for payment processing.
 */
export const processVercelInvoice = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceFinalizedContext;
}): Promise<void> => {
	const { stripeCli, org, logger, fullCustomer } = ctx;
	const { stripeInvoice, stripeSubscription, features } = eventContext;

	// Skip zero-amount invoices
	if (stripeInvoice.amount_due <= 0) {
		return;
	}

	// Check for Vercel metadata
	const vercelInstallationId =
		stripeSubscription.metadata?.vercel_installation_id;
	const vercelBillingPlanId =
		stripeSubscription.metadata?.vercel_billing_plan_id;

	if (!vercelInstallationId || !vercelBillingPlanId) {
		return;
	}

	// Check for default payment method
	if (!stripeSubscription.default_payment_method) {
		return;
	}

	// Verify it's a Vercel custom payment method
	const paymentMethod = await stripeCli.paymentMethods.retrieve(
		stripeSubscription.default_payment_method as string,
	);

	if (paymentMethod.type !== "custom" || !fullCustomer) {
		return;
	}

	// Log Vercel webhook event
	logVercelWebhook({
		logger,
		org,
		event: {
			type: "marketplace.invoice.finalized",
			id: stripeInvoice.id,
		},
	});

	// Get product for Vercel billing
	const product = await ProductService.getFull({
		db: ctx.db,
		orgId: org.id,
		env: ctx.env,
		idOrInternalId: vercelBillingPlanId,
	});

	if (!product) {
		logger.error("Product not found for Vercel billing plan", {
			data: { billingPlanId: vercelBillingPlanId },
		});
		return;
	}

	try {
		// Submit billing data to Vercel (detailed usage breakdown)
		await submitBillingDataToVercel({
			installationId: vercelInstallationId,
			invoice: stripeInvoice,
			customer: fullCustomer,
			product,
		});

		// Submit invoice to Vercel
		await submitInvoiceToVercel({
			installationId: vercelInstallationId,
			invoice: stripeInvoice,
			customer: fullCustomer,
			product,
			org,
			features,
		});

		// Note: Do NOT report payment to Stripe here - we've only submitted the invoice to Vercel
		// Vercel will process payment asynchronously and send marketplace.invoice.paid webhook
		// handleMarketplaceInvoicePaid will then:
		//   1. Create cus_product (user gets access)
		//   2. Report payment as "guaranteed" to Stripe
		//   3. Attach payment record to invoice (marks it as paid)
	} catch (error) {
		logger.error("Failed to process Vercel invoice", {
			data: {
				error: String(error),
				invoiceId: stripeInvoice.id,
			},
		});
	}
};

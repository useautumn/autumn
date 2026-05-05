import type Stripe from "stripe";
import type { ExpandedStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import {
	submitBillingDataToVercel,
	submitInvoiceToVercel,
} from "@/external/vercel/misc/vercelInvoicing";
import { logVercelWebhook } from "@/external/vercel/misc/vercelMiddleware";
import { FeatureService } from "@/internal/features/FeatureService";
import { ProductService } from "@/internal/products/ProductService";

/**
 * Handles Vercel custom payment method invoices.
 * Submits billing data and invoice to Vercel marketplace for payment processing.
 */
export const processVercelInvoice = async ({
	ctx,
	stripeInvoice,
	stripeSubscription,
}: {
	ctx: StripeWebhookContext;
	stripeInvoice: ExpandedStripeInvoice<
		["discounts.source.coupon", "total_discount_amounts"]
	>;
	stripeSubscription: Stripe.Subscription | null;
}): Promise<void> => {
	const { stripeCli, org, env, db, logger, fullCustomer } = ctx;

	if (stripeInvoice.amount_due <= 0) {
		return;
	}

	const invoiceMetadata = stripeInvoice.metadata as Record<
		string,
		string
	> | null;

	const vercelInstallationId =
		stripeSubscription?.metadata?.vercel_installation_id ??
		invoiceMetadata?.vercel_installation_id;
	const vercelBillingPlanId =
		stripeSubscription?.metadata?.vercel_billing_plan_id ??
		invoiceMetadata?.vercel_billing_plan_id;

	if (!vercelInstallationId || !vercelBillingPlanId) {
		return;
	}

	const pmId =
		(stripeSubscription?.default_payment_method as string | undefined) ??
		fullCustomer?.processors?.vercel?.custom_payment_method_id;

	if (!pmId) {
		return;
	}

	const paymentMethod = await stripeCli.paymentMethods.retrieve(pmId);

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
		db,
		orgId: org.id,
		env,
		idOrInternalId: vercelBillingPlanId,
	});

	if (!product) {
		logger.error("Product not found for Vercel billing plan", {
			data: { billingPlanId: vercelBillingPlanId },
		});
		return;
	}

	const features = await FeatureService.list({
		db,
		orgId: org.id,
		env,
	});

	try {
		await submitBillingDataToVercel({
			installationId: vercelInstallationId,
			invoice: stripeInvoice,
			customer: fullCustomer,
			product,
		});

		await submitInvoiceToVercel({
			installationId: vercelInstallationId,
			invoice: stripeInvoice,
			customer: fullCustomer,
			product,
			org,
			features,
		});
	} catch (error) {
		logger.error("Failed to process Vercel invoice", {
			data: {
				error: String(error),
				invoiceId: stripeInvoice.id,
			},
		});
	}
};

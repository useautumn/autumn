import type Stripe from "stripe";
import type { ExpandedStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import {
	submitBillingDataToVercel,
	submitInvoiceToVercel,
} from "@/external/vercel/misc/vercelInvoicing";
import { enrichVercelEventLogger } from "@/external/vercel/misc/vercelLogContext";
import { logVercelWebhook } from "@/external/vercel/misc/vercelMiddleware";
import { ensureVercelInvoiceModeSubscription } from "@/external/vercel/misc/vercelStripeInvoiceMode";
import { FeatureService } from "@/internal/features/FeatureService";
import { ProductService } from "@/internal/products/ProductService";
import { logCaughtError } from "@/utils/logging/logCaughtError";

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
	const { stripeCli, org, env, db, fullCustomer } = ctx;
	let { logger } = ctx;

	if (stripeInvoice.amount_due <= 0) {
		return;
	}

	if (!fullCustomer) {
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

	logger = enrichVercelEventLogger({
		ctx,
		vercelEventContext: {
			type: "marketplace.invoice.finalized",
			id: stripeInvoice.id,
			installation_id: vercelInstallationId,
			external_invoice_id: stripeInvoice.id,
		},
	});
	const vercelCtx = { ...ctx, logger };

	logVercelWebhook({
		logger,
		org,
		event: {
			type: "marketplace.invoice.finalized",
			id: stripeInvoice.id,
		},
	});

	// Lazily migrate legacy Vercel subscriptions to invoice mode. No-op if
	// already `send_invoice` or if the subscription is canceled.
	if (stripeSubscription) {
		await ensureVercelInvoiceModeSubscription({
			ctx: vercelCtx,
			stripeCli,
			subscription: stripeSubscription,
		});
	}

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
			testOptions: ctx.testOptions,
		});

		await submitInvoiceToVercel({
			installationId: vercelInstallationId,
			invoice: stripeInvoice,
			customer: fullCustomer,
			product,
			org,
			features,
			logger,
			testOptions: ctx.testOptions,
		});
	} catch (error) {
		logCaughtError({
			logger,
			message: "Failed to process Vercel invoice",
			error,
			data: {
				invoiceId: stripeInvoice.id,
				installationId: vercelInstallationId,
			},
		});
	}
};

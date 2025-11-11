import {
	type AppEnv,
	CusProductStatus,
	type FullCustomerPrice,
	type InvoiceStatus,
	type Organization,
} from "@autumn/shared";

import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import {
	submitBillingDataToVercel,
	submitInvoiceToVercel,
} from "@/external/vercel/misc/vercelInvoicing.js";
import { logVercelWebhook } from "@/external/vercel/misc/vercelMiddleware.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { getInvoiceItems } from "@/internal/invoices/invoiceUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	getFullStripeInvoice,
	getStripeExpandedInvoice,
	invoiceToSubId,
	updateInvoiceIfExists,
} from "../stripeInvoiceUtils.js";

/**
 * Handles invoice.finalized webhook
 *
 * For regular invoices: Creates Autumn invoice records
 * For Vercel custom payment method invoices: Submits invoice to Vercel marketplace for payment processing
 */
export const handleInvoiceFinalized = async ({
	db,
	org,
	data,
	env,
	logger,
}: {
	db: DrizzleCli;
	org: Organization;
	data: Stripe.Invoice;
	env: AppEnv;
	logger: any;
}) => {
	const stripeCli = createStripeCli({ org, env });
	const invoice = await getFullStripeInvoice({
		stripeCli,
		stripeId: data.id!,
	});

	const features = await FeatureService.list({
		db,
		orgId: org.id,
		env,
	});

	const subId = invoiceToSubId({ invoice });

	if (subId) {
		const stripeCli = createStripeCli({ org, env });
		// Handle Vercel custom payment method invoices
		if (subId && invoice.amount_due > 0) {
			const subscription = await stripeCli.subscriptions.retrieve(subId);

			const vercelInstallationId =
				subscription.metadata?.vercel_installation_id;
			const vercelBillingPlanId = subscription.metadata?.vercel_billing_plan_id;

			if (
				vercelInstallationId &&
				vercelBillingPlanId &&
				subscription.default_payment_method
			) {
				const paymentMethod = await stripeCli.paymentMethods.retrieve(
					subscription.default_payment_method as string,
				);

				// Only process if it's a custom payment method (Vercel)
				if (paymentMethod.type === "custom") {
					logVercelWebhook({
						logger,
						org,
						event: {
							type: "marketplace.invoice.finalized",
							id: invoice.id,
						},
					});

					try {
						// Get customer and product
						const customer = await CusService.getByStripeId({
							db,
							stripeId: invoice.customer as string,
						});

						if (!customer) {
							console.error("Customer not found for Vercel invoice", {
								stripeCustomerId: invoice.customer,
							});
							return;
						}

						const product = await ProductService.getFull({
							db,
							orgId: org.id,
							env,
							idOrInternalId: vercelBillingPlanId,
						});

						if (!product) {
							console.error("Product not found for Vercel billing plan", {
								billingPlanId: vercelBillingPlanId,
							});
							return;
						}

						// Submit billing data to Vercel (detailed usage breakdown)
						await submitBillingDataToVercel({
							installationId: vercelInstallationId,
							invoice,
							customer,
							product,
						});

						// Submit invoice to Vercel
						await submitInvoiceToVercel({
							installationId: vercelInstallationId,
							invoice,
							customer,
							product,
							org,
							features,
						});

						// Do NOT report payment to Stripe here - we've only submitted the invoice to Vercel
						// Vercel will process payment asynchronously and send marketplace.invoice.paid webhook
						// handleMarketplaceInvoicePaid will then:
						//   1. Create cus_product (user gets access)
						//   2. Report payment as "guaranteed" to Stripe
						//   3. Attach payment record to invoice (marks it as paid)
					} catch (error: any) {
						logger.error("Failed to process Vercel invoice", {
							data: {
								error: error.message,
								invoiceId: invoice.id,
							},
						});
					}
				}
			}
		}
		const expandedInvoice = await getStripeExpandedInvoice({
			stripeCli,
			stripeInvoiceId: invoice.id!,
		});

		const activeProducts = await CusProductService.getByStripeSubId({
			db,
			stripeSubId: subId,
			orgId: org.id,
			env,
			inStatuses: [CusProductStatus.Active],
		});

		if (activeProducts.length === 0) {
			return;
		}

		const updated = await updateInvoiceIfExists({
			db,
			invoice,
		});

		if (updated) {
			return;
		}

		const prices = activeProducts.flatMap((cp) =>
			cp.customer_prices.map((cpr: FullCustomerPrice) => cpr.price),
		);

		const invoiceItems = await getInvoiceItems({
			stripeInvoice: invoice,
			prices: prices,
			logger,
		});

		await InvoiceService.createInvoiceFromStripe({
			db,
			stripeInvoice: expandedInvoice,
			internalCustomerId: activeProducts[0].internal_customer_id,
			productIds: activeProducts.map((p) => p.product.id),
			internalProductIds: activeProducts.map((p) => p.internal_product_id),
			internalEntityId: activeProducts[0].internal_entity_id,
			status: invoice.status as InvoiceStatus,
			org,
			items: invoiceItems,
		});
	}
};

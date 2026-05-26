import {
	AppEnv,
	type Customer,
	type Feature,
	type FeatureOptions,
	type FullProduct,
	mapToProductV2,
	type Organization,
	type Price,
	productV2ToBasePrice,
} from "@autumn/shared";
import { Vercel } from "@vercel/sdk";
import type Stripe from "stripe";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { buildInvoiceMemo } from "@/internal/invoices/invoiceMemoUtils.js";
import { findPrepaidPrice } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";
import {
	getVercelSdkServerURL,
	type VercelSdkTestOptions,
} from "./vercelSdkOptions.js";

/**
 * Vercel Marketplace Payment Flow:
 *
 * 1. Resource creation provisions a Stripe subscription in invoice mode
 *    (`collection_method: "send_invoice"`, `days_until_due: 30`). The
 *    subscription auto-activates regardless of first-invoice status.
 * 2. `invoice.finalized` → `processVercelInvoice` submits the finalized
 *    invoice to Vercel via `submitBillingDataToVercel` +
 *    `submitInvoiceToVercel`.
 * 3. Vercel marketplace collects payment from the end customer out of band.
 * 4. `marketplace.invoice.paid` → `handleMarketplaceInvoicePaid` marks the
 *    Stripe invoice paid via `invoices.pay(id, { paid_out_of_band: true })`.
 *    Stripe Payment Records / `attachPayment` are intentionally NOT used.
 * 5. `marketplace.invoice.notpaid` → `handleMarketplaceInvoiceNotPaid`
 *    suspends the Vercel resource, expires the Autumn cus_product (activating
 *    the default fallback), and cancels the Stripe subscription.
 */

/**
 * Submits billing and usage data to Vercel
 * Shows detailed breakdown of usage by feature in Vercel dashboard
 */
export const submitBillingDataToVercel = async ({
	installationId,
	invoice,
	customer,
	product,
	testOptions,
}: {
	installationId: string;
	invoice: Stripe.Invoice;
	customer: Customer;
	product: FullProduct;
	testOptions?: VercelSdkTestOptions;
}) => {
	const vercel = new Vercel({
		bearerToken: customer.processors?.vercel?.access_token,
		serverURL: getVercelSdkServerURL(testOptions),
	});

	const firstLineItem = invoice.lines.data[0];
	const rawPeriodStart = firstLineItem?.period?.start || invoice.period_start;
	const rawPeriodEnd = firstLineItem?.period?.end || invoice.period_end;
	const periodStart = rawPeriodStart;
	const periodEnd =
		rawPeriodEnd > rawPeriodStart ? rawPeriodEnd : rawPeriodStart + 1;

	// Map invoice line items to Vercel billing format
	const billingItems = invoice.lines.data
		.filter((line) => line.amount > 0) // Only include items with charges
		.map((line) => {
			const amount = line.amount / 100; // Convert to dollars
			return {
				resourceId: line.metadata?.vercel_resource_id || installationId,
				billingPlanId: line.metadata?.vercel_billing_plan_id || product.id,
				name: line.description || product.name,
				price: (amount / (line.quantity || 1)).toFixed(2), // Unit price
				quantity: line.quantity || 1,
				units: "units",
				total: amount.toFixed(2),
			};
		});

	// Extract usage metrics from line items (for usage-based features)
	const usageMetrics = invoice.lines.data
		.filter((line) => line.description?.includes("Messages")) // Usage items
		.map((line) => ({
			resourceId: installationId,
			name: "Messages",
			type: "interval" as const,
			units: "messages",
			dayValue: line.quantity || 0,
			periodValue: line.quantity || 0,
		}));

	await vercel.marketplace.submitBillingData({
		integrationConfigurationId: installationId,
		requestBody: {
			timestamp: new Date(),
			eod: new Date(periodEnd * 1000),
			period: {
				start: new Date(periodStart * 1000),
				end: new Date(periodEnd * 1000),
			},
			billing: {
				items: billingItems,
			},
			usage: usageMetrics,
		},
	});
};

export const submitInvoiceToVercel = async ({
	installationId,
	invoice,
	customer,
	product,
	org,
	features,
	logger,
	testOptions,
}: {
	installationId: string;
	invoice: Stripe.Invoice;
	customer: Customer;
	product: FullProduct;
	org: Organization;
	features: Feature[];
	logger?: Logger;
	testOptions?: VercelSdkTestOptions;
}) => {
	const vercel = new Vercel({
		bearerToken: customer.processors?.vercel?.access_token,
		serverURL: getVercelSdkServerURL(testOptions),
	});

	const price = productV2ToBasePrice({ product: mapToProductV2({ product }) });

	if (!price) {
		throw new Error("Price not found");
	}

	// Get the actual billing period from line items (invoice period_start/end can be the same on creation)
	const firstLineItem = invoice.lines.data[0];
	const rawPeriodStart = firstLineItem?.period?.start || invoice.period_start;
	const rawPeriodEnd = firstLineItem?.period?.end || invoice.period_end;
	const periodStart = rawPeriodStart;
	const periodEnd =
		rawPeriodEnd > rawPeriodStart ? rawPeriodEnd : rawPeriodStart + 1;

	// Vercel requires period.start <= invoiceDate <= period.end. For manual InvoiceItem
	// charges (top-ups) the InvoiceItem is created after the Invoice, so invoice.created
	// can fall before the line item's period.start — clamp into range.
	const invoiceDateSec = Math.max(
		periodStart,
		Math.min(invoice.created, periodEnd),
	);

	// Calculate total amount from invoice (includes subscription + usage charges)
	const totalAmount = invoice.amount_due / 100;

	let memo: string | undefined;

	if (org.config.invoice_memos) {
		try {
			memo = await buildInvoiceMemo({ org, product, features });
		} catch (error) {
			logCaughtError({
				logger,
				message: "[vercel/invoice] Failed to build invoice memo",
				error,
				data: { invoiceId: invoice.id, productId: product.id },
				level: "warn",
			});
		}
	}

	return await vercel.marketplace.submitInvoice({
		integrationConfigurationId: installationId,
		requestBody: {
			externalId: invoice.id,
			invoiceDate: new Date(invoiceDateSec * 1000),
			items: [
				{
					resourceId: installationId,
					billingPlanId: product.id,
					name: product.name,
					price: totalAmount.toFixed(2), // Total price including usage
					quantity: 1,
					units: price.interval?.toString() ?? "month",
					total: totalAmount.toFixed(2), // Same as price since quantity=1
				},
			],
			period: {
				start: new Date(periodStart * 1000),
				end: new Date(periodEnd * 1000),
			},
			...(customer.env === AppEnv.Sandbox || product.env === AppEnv.Sandbox
				? {
						test: {
							validate: true,
							result: "paid",
							// result: "notpaid",
						},
					}
				: {}),
			...(memo ? { memo } : {}),
		},
	});
};

/**
 * Parses Vercel metadata to extract prepaid quantities for features
 * Expected metadata format: { "<feature_id>": quantity, ... }
 * Validates features exist in product and have prepaid prices configured
 */
export const parseVercelPrepaidQuantities = ({
	metadata,
	product,
	prices,
}: {
	metadata: Record<string, any>;
	product: FullProduct;
	prices: Price[];
}): FeatureOptions[] => {
	const optionsList: FeatureOptions[] = [];

	// Iterate over metadata entries
	for (const [featureId, quantity] of Object.entries(metadata)) {
		// Skip non-numeric values silently
		if (typeof quantity !== "number" || Number.isNaN(quantity)) {
			continue;
		}

		// Find entitlement for this feature
		const entitlement = product.entitlements.find(
			(ent) => ent.feature.id === featureId,
		);

		if (!entitlement) {
			continue;
		}

		// Validate prepaid price exists for this feature
		const prepaidPrice = findPrepaidPrice({
			prices,
			internalFeatureId: entitlement.internal_feature_id,
		});

		if (!prepaidPrice) {
			continue;
		}

		// Valid prepaid feature with price - add to options list
		optionsList.push({
			feature_id: featureId,
			internal_feature_id: entitlement.internal_feature_id,
			quantity,
		});
	}

	return optionsList;
};

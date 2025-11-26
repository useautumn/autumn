import {
	ApiVersion,
	AppEnv,
	AttachBranch,
	type AttachConfig,
	type Customer,
	type Feature,
	type FeatureOptions,
	type FullCustomer,
	type FullProduct,
	mapToProductV2,
	type Organization,
	type Price,
	ProrationBehavior,
	productV2ToBasePrice,
} from "@autumn/shared";
import { Vercel } from "@vercel/sdk";
import type { Context } from "hono";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { buildInvoiceMemo } from "@/internal/invoices/invoiceMemoUtils.js";
import { findPrepaidPrice } from "@/internal/products/prices/priceUtils/findPriceUtils.js";

/**
 * Vercel Marketplace Payment Flow:
 *
 * 1. Subscription created with collection_method: "charge_automatically" and custom payment method
 * 2. invoice.finalized → handleInvoiceFinalized calls submitBillingDataToVercel() then submitInvoiceToVercel()
 * 3. Vercel processes payment asynchronously
 * 4. marketplace.invoice.paid → handleMarketplaceInvoicePaid creates cus_product and reports payment to Stripe
 * 5. Invoice marked as paid → Subscription becomes active
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
}: {
	installationId: string;
	invoice: Stripe.Invoice;
	customer: Customer;
	product: FullProduct;
}) => {
	const vercel = new Vercel({
		bearerToken: customer.processors?.vercel?.access_token,
	});

	const firstLineItem = invoice.lines.data[0];
	const periodStart = firstLineItem?.period?.start || invoice.period_start;
	const periodEnd = firstLineItem?.period?.end || invoice.period_end;

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
}: {
	installationId: string;
	invoice: Stripe.Invoice;
	customer: Customer;
	product: FullProduct;
	org: Organization;
	features: Feature[];
}) => {
	const vercel = new Vercel({
		bearerToken: customer.processors?.vercel?.access_token,
	});

	const price = productV2ToBasePrice({ product: mapToProductV2({ product }) });

	if (!price) {
		throw new Error("Price not found");
	}

	// Get the actual billing period from line items (invoice period_start/end can be the same on creation)
	const firstLineItem = invoice.lines.data[0];
	const periodStart = firstLineItem?.period?.start || invoice.period_start;
	const periodEnd = firstLineItem?.period?.end || invoice.period_end;

	// Calculate total amount from invoice (includes subscription + usage charges)
	const totalAmount = invoice.amount_due / 100;

	let memo: string | undefined;

	if (org.config.invoice_memos) {
		try {
			memo = await buildInvoiceMemo({ org, product, features });
		} catch (_) {}
	}

	return await vercel.marketplace.submitInvoice({
		integrationConfigurationId: installationId,
		requestBody: {
			externalId: invoice.id,
			invoiceDate: new Date(invoice.created * 1000),
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

export const getVercelAttachBody = ({
	stripeCli,
	stripeCustomer,
	now,
	org,
	customer,
	product,
	features,
	integrationConfigurationId,
	billingPlanId,
	db,
	env,
	c,
	customPaymentMethod,
	optionsList = [],
	resourceId,
}: {
	stripeCli: Stripe;
	stripeCustomer: Stripe.Customer;
	now: number;
	org: Organization;
	customer: FullCustomer;
	product: FullProduct;
	features: Feature[];
	integrationConfigurationId: string;
	billingPlanId: string;
	db: DrizzleCli;
	env: AppEnv;
	c: Context<HonoEnv>;
	customPaymentMethod: Stripe.PaymentMethod | null;
	optionsList?: FeatureOptions[];
	resourceId?: string;
}): { attachParams: AttachParams; config: AttachConfig } => {
	const attachParams: AttachParams = {
		stripeCli,
		stripeCus: stripeCustomer,
		now: now ?? Date.now(),
		paymentMethod: customPaymentMethod, // Pass Vercel custom payment method
		org,
		customer,
		products: [product],
		optionsList,
		prices: product.prices,
		entitlements: product.entitlements,
		freeTrial: null,
		replaceables: [],
		rewards: [],

		cusProducts: customer.customer_products,
		entities: customer.entities || [],
		features,

		// Use charge_automatically (not send_invoice) for custom payment methods
		// This enables the Payment Records API flow for external payment processing
		invoiceOnly: false,

		// Store Vercel metadata on the Stripe subscription for webhook handlers
		metadata: {
			vercel_installation_id: integrationConfigurationId,
			vercel_billing_plan_id: billingPlanId,
			vercel_product_id: product.id,
			vercel_resource_id: resourceId || integrationConfigurationId,
		},

		req: c.get("ctx"),
		// req: {
		// 	db,
		// 	org,
		// 	env: env as AppEnv,
		// 	logger: c.get("ctx").logger,
		// 	features,
		// },
		apiVersion: ApiVersion.V1_2,
	};

	const config: AttachConfig = {
		branch: AttachBranch.New,
		onlyCheckout: false,
		invoiceCheckout: false,
		carryUsage: false,
		proration: ProrationBehavior.None, // No proration for first subscription
		disableTrial: true, // No trials on plan changes
		invoiceOnly: false, // Must be false for charge_automatically
		disableMerge: false,
		sameIntervals: false,
		carryTrial: false,
		finalizeInvoice: true, // Finalize invoice immediately to trigger invoice.finalized webhook
		requirePaymentMethod: true, // Require custom payment method
	};

	return { attachParams, config };
};

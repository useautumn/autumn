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
import { Marketplace } from "@vercel/sdk/sdk/marketplace.js";
import type Stripe from "stripe";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { buildInvoiceMemo } from "@/internal/invoices/invoiceMemoUtils.js";
import { findPrepaidPrice } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";
import {
	getVercelSdkServerURL,
	type VercelSdkTestOptions,
} from "./vercelSdkOptions.js";

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
	const marketplace = new Marketplace({
		bearerToken: customer.processors?.vercel?.access_token,
		serverURL: getVercelSdkServerURL(testOptions),
	});

	const firstLineItem = invoice.lines.data[0];
	const rawPeriodStart = firstLineItem?.period?.start || invoice.period_start;
	const rawPeriodEnd = firstLineItem?.period?.end || invoice.period_end;
	const periodStart = rawPeriodStart;
	const periodEnd =
		rawPeriodEnd > rawPeriodStart ? rawPeriodEnd : rawPeriodStart + 1;

	const billingItems = invoice.lines.data
		.filter((line) => line.amount > 0)
		.map((line) => {
			const amount = line.amount / 100;
			return {
				resourceId: line.metadata?.vercel_resource_id || installationId,
				billingPlanId: line.metadata?.vercel_billing_plan_id || product.id,
				name: line.description || product.name,
				price: (amount / (line.quantity || 1)).toFixed(2),
				quantity: line.quantity || 1,
				units: "units",
				total: amount.toFixed(2),
			};
		});

	const usageMetrics = invoice.lines.data
		.filter((line) => line.description?.includes("Messages"))
		.map((line) => ({
			resourceId: installationId,
			name: "Messages",
			type: "interval" as const,
			units: "messages",
			dayValue: line.quantity || 0,
			periodValue: line.quantity || 0,
		}));

	await marketplace.submitBillingData({
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
	const marketplace = new Marketplace({
		bearerToken: customer.processors?.vercel?.access_token,
		serverURL: getVercelSdkServerURL(testOptions),
	});

	const price = productV2ToBasePrice({ product: mapToProductV2({ product }) });

	if (!price) {
		throw new Error("Price not found");
	}

	const firstLineItem = invoice.lines.data[0];
	const rawPeriodStart = firstLineItem?.period?.start || invoice.period_start;
	const rawPeriodEnd = firstLineItem?.period?.end || invoice.period_end;
	const periodStart = rawPeriodStart;
	const periodEnd =
		rawPeriodEnd > rawPeriodStart ? rawPeriodEnd : rawPeriodStart + 1;

	// Vercel requires period.start <= invoiceDate <= period.end. For manual InvoiceItem
	const invoiceDateSec = Math.max(
		periodStart,
		Math.min(invoice.created, periodEnd),
	);

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

	return await marketplace.submitInvoice({
		integrationConfigurationId: installationId,
		requestBody: {
			externalId: invoice.id,
			invoiceDate: new Date(invoiceDateSec * 1000),
			items: [
				{
					resourceId: installationId,
					billingPlanId: product.id,
					name: product.name,
					price: totalAmount.toFixed(2),
					quantity: 1,
					units: price.interval?.toString() ?? "month",
					total: totalAmount.toFixed(2),
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
						},
					}
				: {}),
			...(memo ? { memo } : {}),
		},
	});
};

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

	for (const [featureId, quantity] of Object.entries(metadata)) {
		if (typeof quantity !== "number" || Number.isNaN(quantity)) {
			continue;
		}

		const entitlement = product.entitlements.find(
			(ent) => ent.feature.id === featureId,
		);

		if (!entitlement) {
			continue;
		}

		const prepaidPrice = findPrepaidPrice({
			prices,
			internalFeatureId: entitlement.internal_feature_id,
		});

		if (!prepaidPrice) {
			continue;
		}

		optionsList.push({
			feature_id: featureId,
			internal_feature_id: entitlement.internal_feature_id,
			quantity,
		});
	}

	return optionsList;
};

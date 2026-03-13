import {
	cusProductToProduct,
	type Invoice,
	type InvoiceItem,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import { getStripeExpandedInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import { findPriceInStripeItems } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { Logger } from "../../external/logtail/logtailUtils.js";
import type { AttachParams } from "../customers/cusProducts/AttachParams.js";
import { upsertInvoiceInCache } from "./actions/cache/upsertInvoiceInCache.js";
import { InvoiceService, processInvoice } from "./InvoiceService.js";

// Purpose of this function is to insert an invoice from attach params when sub is updated -> Correct product ID is set...
export const insertInvoiceFromAttach = async ({
	ctx,
	attachParams,
	invoiceId,
	stripeInvoice,
	logger,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	invoiceId?: string;
	stripeInvoice?: Stripe.Invoice;
	logger: Logger;
}) => {
	const { db } = ctx;
	try {
		if (!stripeInvoice) {
			stripeInvoice = await getStripeExpandedInvoice({
				stripeCli: attachParams.stripeCli,
				stripeInvoiceId: invoiceId!,
			});
		}

		// Create or update
		const invoice = await InvoiceService.getByStripeId({
			db,
			stripeId: stripeInvoice.id!,
		});

		const autumnInvoiceItems = await getInvoiceItems({
			stripeInvoice,
			prices: attachParams.prices,
			logger,
		});

		const products =
			attachParams.fromCancel && attachParams.cusProduct
				? [cusProductToProduct({ cusProduct: attachParams.cusProduct })]
				: attachParams.products;

		const productIds = products.map((p) => p.id);
		const internalProductIds = products.map((p) => p.internal_id);

		logger.info(
			`[insertInvoiceFromAttach] invoice: ${stripeInvoice?.id}, productIds: ${productIds.join(", ")}`,
		);

		if (invoice) {
			const invoice = await InvoiceService.update({
				db,
				query: {
					stripeId: stripeInvoice.id!,
				},
				updates: {
					product_ids: productIds,
					internal_product_ids: internalProductIds,
				},
			});

			const customerId = attachParams.customer.id ?? "";
			if (invoice) {
				await upsertInvoiceInCache({
					ctx,
					customerId,
					invoice,
				});
			}
		} else {
			const invoice = await InvoiceService.createInvoiceFromStripe({
				db,
				stripeInvoice,
				internalCustomerId: attachParams.customer.internal_id,
				internalEntityId: attachParams.internalEntityId,
				org: attachParams.org,
				productIds,
				internalProductIds,
				items: autumnInvoiceItems,
			});

			const customerId = attachParams.customer.id ?? "";
			if (invoice) {
				await upsertInvoiceInCache({
					ctx,
					customerId,
					invoice,
				});
			}
		}
		return stripeInvoice;
	} catch (error) {
		logger.warn("Failed to insert invoice from attach params");
		logger.warn(error);
	}
};

export const invoicesToResponse = ({ invoices }: { invoices: Invoice[] }) => {
	const response = invoices.map((i) =>
		processInvoice({
			invoice: i,
			withItems: false,
			features: [],
		}),
	);

	return response;
};

export const getInvoiceItems = async ({
	stripeInvoice,
	prices,
	logger,
}: {
	stripeInvoice: Stripe.Invoice;
	prices: Price[];
	logger: Logger;
}) => {
	const invoiceItems: InvoiceItem[] = [];

	try {
		for (const line of stripeInvoice.lines.data) {
			const price = findPriceInStripeItems({
				prices,
				lineItem: line,
			});

			if (!price) {
				continue;
			}

			const usageConfig = price.config as UsagePriceConfig;
			invoiceItems.push({
				price_id: price.id!,
				stripe_id: line.id,
				internal_feature_id: usageConfig.internal_feature_id || null,
				description: line.description || "",
				period_start: line.period.start * 1000,
				period_end: line.period.end * 1000,
			});
		}
	} catch (error) {
		logger.error(
			`Failed to get invoice items for invoice ${stripeInvoice.id}`,
			error,
		);
		return [];
	}

	return invoiceItems;
};

export const attachToInvoiceResponse = ({
	invoice,
}: {
	invoice?: Stripe.Invoice | null;
}) => {
	if (!invoice) {
		return undefined;
	}

	return {
		status: invoice.status,
		stripe_id: invoice.id,
		hosted_invoice_url: invoice.hosted_invoice_url,
		total: invoice.total,
		currency: invoice.currency,
		// id: invoice.id,
		// stripe_id: invoice.stripe_id,
		// status: invoice.status,
		// created_at: invoice.created_at,
		// updated_at: invoice.updated_at,
	};
};

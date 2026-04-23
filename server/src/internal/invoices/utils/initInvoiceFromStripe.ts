import {
	deduplicateArray,
	type FullCustomer,
	type FullProduct,
	type InsertInvoice,
	secondsToMs,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";
import { getInvoiceDiscounts } from "@/external/stripe/stripeInvoiceUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getInvoiceItems } from "@/internal/invoices/invoiceUtils";
import { generateId } from "@/utils/genUtils";

/**
 * Creates an Invoice object from a Stripe invoice.
 */
export const initInvoiceFromStripe = async ({
	ctx,
	stripeInvoice,
	fullProducts,
	fullCustomer,
	internalEntityId,
}: {
	ctx: AutumnContext;
	stripeInvoice: Stripe.Invoice;
	fullProducts: FullProduct[];
	fullCustomer: FullCustomer;
	internalEntityId?: string;
}): Promise<InsertInvoice> => {
	const productIds = deduplicateArray(fullProducts.map((p) => p.id));
	const internalProductIds = deduplicateArray(
		fullProducts.map((p) => p.internal_id),
	);

	const internalCustomerId = fullCustomer.internal_id;

	if (!internalEntityId) {
		internalEntityId = fullCustomer.entity?.internal_id;
	}

	const autumnInvoiceItems = await getInvoiceItems({
		stripeInvoice,
		prices: fullProducts.flatMap((p) => p.prices),
		logger: ctx.logger,
	});

	const atmnTotal = stripeToAtmnAmount({
		amount: stripeInvoice.total,
		currency: stripeInvoice.currency,
	});

	const atmnAmountPaid = stripeToAtmnAmount({
		amount: stripeInvoice.amount_paid,
		currency: stripeInvoice.currency,
	});

	return {
		id: generateId("inv"),
		internal_customer_id: internalCustomerId,
		product_ids: [...new Set(productIds)],
		internal_product_ids: [...new Set(internalProductIds)],
		created_at: secondsToMs(stripeInvoice.created),
		stripe_id: stripeInvoice.id!,
		hosted_invoice_url: stripeInvoice.hosted_invoice_url || null,
		status: stripeInvoice.status as string | undefined,
		internal_entity_id: internalEntityId || null,
		total: atmnTotal,
		amount_paid: atmnAmountPaid,
		currency: stripeInvoice.currency,
		discounts: getInvoiceDiscounts({ expandedInvoice: stripeInvoice }),
		items: autumnInvoiceItems,
	};
};

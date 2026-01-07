import type { FullCustomer, FullProduct } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { getInvoiceItems } from "@/internal/invoices/invoiceUtils";

export const upsertInvoiceFromBilling = async ({
	ctx,
	stripeInvoice,
	fullProducts,
	fullCustomer,
}: {
	ctx: AutumnContext;
	stripeInvoice: Stripe.Invoice;
	fullProducts: FullProduct[];
	fullCustomer: FullCustomer;
}) => {
	const productIds = fullProducts.map((p) => p.id);
	const internalProductIds = fullProducts.map((p) => p.internal_id);

	const internalCustomerId = fullCustomer.internal_id;
	const internalEntityId = fullCustomer.entity?.internal_id;

	const autumnInvoiceItems = await getInvoiceItems({
		stripeInvoice,
		prices: fullProducts.flatMap((p) => p.prices),
		logger: ctx.logger,
	});

	// 1. Check if invoice exists in Autumn
	const updatedInvoice = await InvoiceService.updateByStripeId({
		db: ctx.db,
		stripeId: stripeInvoice.id,
		updates: {
			product_ids: productIds,
			internal_product_ids: internalProductIds,
		},
	});

	if (updatedInvoice) return;

	// 2. Create invoice
	const newInvoice = await InvoiceService.createInvoiceFromStripe({
		db: ctx.db,
		stripeInvoice,
		internalCustomerId,
		internalEntityId,
		org: ctx.org,
		productIds,
		internalProductIds,
		items: autumnInvoiceItems,
	});

	console.log(
		"[upsertInvoiceFromBilling] Inserted new invoice into DB:",
		newInvoice,
	);

	return newInvoice;
};

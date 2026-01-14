import { deduplicateArray, type FullCustomerPrice } from "@autumn/shared";
import type { StripeInvoicePaidContext } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/setupStripeInvoicePaidContext.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { getInvoiceItems } from "@/internal/invoices/invoiceUtils.js";

export const upsertAutumnInvoice = async ({
	ctx,
	invoicePaidContext,
}: {
	ctx: StripeWebhookContext;
	invoicePaidContext: StripeInvoicePaidContext;
}) => {
	const { db, org, logger, fullCustomer } = ctx;
	const { stripeInvoice, customerProducts } = invoicePaidContext;

	// 1. Try to update existing invoice
	const updated = await InvoiceService.updateFromStripeInvoice({
		db,
		stripeInvoice,
	});

	if (updated) return;

	// Insert new invoice (for checkout session completed, recurring cycles)
	if (!fullCustomer || !customerProducts) return;

	const invoiceItems = await getInvoiceItems({
		stripeInvoice,
		prices: customerProducts.flatMap((p) =>
			p.customer_prices.map((cpr: FullCustomerPrice) => cpr.price),
		),
		logger,
	});

	const internalEntityIds = deduplicateArray(
		customerProducts.map((cp) => cp.internal_entity_id),
	);

	const productIds = deduplicateArray(
		customerProducts.map((p) => p.product_id),
	);

	const internalProductIds = deduplicateArray(
		customerProducts.map((p) => p.internal_product_id),
	);

	await InvoiceService.createInvoiceFromStripe({
		db,
		stripeInvoice,
		internalCustomerId: fullCustomer.internal_id,
		internalEntityId:
			internalEntityIds.length === 1 ? internalEntityIds[0] : undefined,
		productIds,
		internalProductIds,
		org,
		items: invoiceItems,
	});

	logger.info(
		`[invoice.paid] Created Autumn invoice for Stripe invoice ${stripeInvoice.id}`,
	);
};

// const invoiceLines = stripeInvoice.lines.data;
// let filteredCustomerProducts: FullCusProduct[] = customerProducts;
// try {
//   filteredCustomerProducts = customerProducts.filter((cp) =>
//     invoiceLines.some((l) =>
//       lineItemInCusProduct({ cusProduct: cp, lineItem: l }),
//     ),
//   );

//   if (filteredCustomerProducts.length === 0) {
//     filteredCustomerProducts = customerProducts;
//   }
// } catch (error) {
//   logger.error(
//     "[invoice.paid] Failed to filter customer products for invoice",
//   );
//   logger.error({ error });
// }

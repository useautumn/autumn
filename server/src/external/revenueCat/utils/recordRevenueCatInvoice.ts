import {
	type FullCustomer,
	type FullProduct,
	type InsertInvoice,
	InvoiceStatus,
	ProcessorType,
} from "@autumn/shared";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { generateId } from "@/utils/genUtils";

type RecordableEvent = {
	transaction_id?: string | null;
	original_transaction_id?: string | null;
	// RevenueCat's `price` is always normalized to USD; `currency` describes
	// `price_in_purchased_currency`, NOT `price`. We record `price`, so the
	// invoice currency is always USD.
	price?: number | null;
	purchased_at_ms?: number | null;
	event_timestamp_ms?: number | null;
};

/**
 * Insert (or upsert by stripe_id) an invoice row that mirrors a RevenueCat
 * webhook event, then invalidate the customer's full-customer cache so the
 * next read sees the new invoice.
 *
 * The DB column is named `stripe_id` for legacy reasons; for RevenueCat
 * invoices we store `event.transaction_id` (falling back to
 * `event.original_transaction_id`) without any prefix. Collision risk across
 * processor namespaces is treated as effectively zero.
 */
export const recordRevenueCatInvoice = async ({
	ctx,
	event,
	customer,
	product,
}: {
	ctx: RevenueCatWebhookContext;
	event: RecordableEvent;
	customer: FullCustomer;
	product: FullProduct;
}) => {
	const { db, logger } = ctx;

	const externalId = event.transaction_id ?? event.original_transaction_id;
	if (!externalId) {
		logger.warn(
			`[recordRevenueCatInvoice] skipping invoice write — no transaction_id or original_transaction_id on event for customer ${customer.id}`,
		);
		return;
	}

	const total = event.price ?? 0;
	// `event.price` is normalized to USD by RevenueCat regardless of the
	// purchase currency, so the recorded invoice is always denominated in USD.
	const currency = "usd";
	const createdAt =
		event.purchased_at_ms ?? event.event_timestamp_ms ?? Date.now();

	const invoice: InsertInvoice = {
		id: generateId("inv"),
		internal_customer_id: customer.internal_id,
		internal_entity_id: null,
		product_ids: [product.id],
		internal_product_ids: [product.internal_id],
		stripe_id: externalId,
		processor_type: ProcessorType.RevenueCat,
		status: InvoiceStatus.Paid,
		hosted_invoice_url: null,
		total,
		amount_paid: total,
		refunded_amount: 0,
		currency,
		discounts: [],
		items: [],
		created_at: createdAt,
	};

	await InvoiceService.upsert({ db, invoice });

	if (customer.id) {
		await deleteCachedFullCustomer({
			ctx,
			customerId: customer.id,
			source: "recordRevenueCatInvoice",
		});
	}
};

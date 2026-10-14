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
	price?: number | null;
	purchased_at_ms?: number | null;
	event_timestamp_ms?: number | null;
};

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
	const currency = "usd";
	const createdAt =
		event.purchased_at_ms ?? event.event_timestamp_ms ?? Date.now();

	const invoice: InsertInvoice = {
		id: generateId("inv"),
		internal_customer_id: customer.internal_id,
		org_id: customer.org_id,
		env: customer.env,
		internal_entity_id: null,
		product_ids: [product.id],
		internal_product_ids: [product.internal_id],
		stripe_id: externalId,
		processor_type: ProcessorType.RevenueCat,
		status: InvoiceStatus.Paid,
		hosted_invoice_url: null,
		total,
		amount_paid: total,
		paid_at: createdAt,
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

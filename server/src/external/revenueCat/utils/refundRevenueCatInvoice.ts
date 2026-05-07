import type { FullCustomer } from "@autumn/shared";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { InvoiceService } from "@/internal/invoices/InvoiceService";

type RefundableEvent = {
	transaction_id?: string | null;
	original_transaction_id?: string | null;
};

/**
 * Mark an existing RevenueCat invoice row as refunded by setting
 * `refunded_amount = total` for the row whose `stripe_id` matches the
 * event's transaction_id (with `original_transaction_id` as fallback).
 *
 * If no matching invoice exists we log and return successfully — RevenueCat
 * does not fire CANCELLATION webhooks for refunds of non-latest periods, so
 * a missing row is an accepted gap rather than an error.
 */
export const refundRevenueCatInvoice = async ({
	ctx,
	event,
	customer,
}: {
	ctx: RevenueCatWebhookContext;
	event: RefundableEvent;
	customer: FullCustomer;
}) => {
	const { db, logger } = ctx;

	const externalId = event.transaction_id ?? event.original_transaction_id;
	if (!externalId) {
		logger.info(
			`[refundRevenueCatInvoice] no transaction_id/original_transaction_id on event for customer ${customer.id}, skipping refund`,
		);
		return;
	}

	const existing = await InvoiceService.getByStripeId({
		db,
		stripeId: externalId,
	});

	if (!existing) {
		logger.info(
			`[refundRevenueCatInvoice] no invoice found with stripe_id=${externalId} for customer ${customer.id}, accepting gap and continuing`,
		);
		return;
	}

	await InvoiceService.update({
		db,
		query: { id: existing.id },
		updates: { refunded_amount: existing.total },
	});

	if (customer.id) {
		await deleteCachedFullCustomer({
			ctx,
			customerId: customer.id,
			source: "refundRevenueCatInvoice",
		});
	}
};

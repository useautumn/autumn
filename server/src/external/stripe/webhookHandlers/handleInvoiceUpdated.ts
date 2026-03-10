import {
	type InsertInvoice,
	InvoiceStatus,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { invoiceActions } from "@/internal/invoices/actions";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import type { StripeWebhookContext } from "../webhookMiddlewares/stripeWebhookContext";

export const handleInvoiceUpdated = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.Event;
}) => {
	const invoiceObject = event.data.object as Stripe.Invoice;
	const currentInvoice = await InvoiceService.getByStripeId({
		db: ctx.db,
		stripeId: invoiceObject.id!,
	});

	const updates: Partial<InsertInvoice> = {};

	if (invoiceObject.status === "void") {
		updates.status = InvoiceStatus.Void;
	}

	if (invoiceObject.status === "open") {
		updates.status = InvoiceStatus.Open;
	}

	if (currentInvoice) {
		const newAtmnTotal = stripeToAtmnAmount({
			amount: invoiceObject.total,
			currency: invoiceObject.currency,
		});

		const totalEquals = new Decimal(newAtmnTotal).eq(currentInvoice.total);

		if (!totalEquals) {
			updates.total = newAtmnTotal;
		}
	}

	if (Object.keys(updates).length > 0 && invoiceObject.id) {
		await invoiceActions.updateFromStripe({
			ctx,
			customerId: ctx.customerId ?? "",
			stripeInvoice: invoiceObject,
		});
	}
};

import {
	type InsertInvoice,
	InvoiceStatus,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";

export const handleInvoiceUpdated = async ({
	event,
	req,
}: {
	event: Stripe.Event;
	req: any;
}) => {
	const invoiceObject = event.data.object as Stripe.Invoice;
	const currentInvoice = await InvoiceService.getByStripeId({
		db: req.db,
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
		await InvoiceService.updateByStripeId({
			db: req.db,
			stripeId: invoiceObject.id,
			updates,
		});
	}
};

import type { FullCustomer, FullProduct, Invoice } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { initInvoiceFromStripe } from "@/internal/invoices/utils/initInvoiceFromStripe";
import { upsertInvoiceInCache } from "./cache/upsertInvoiceInCache";

export const upsertInvoiceFromStripe = async ({
	ctx,
	stripeInvoice,
	fullCustomer,
	fullProducts,
	internalEntityId,
}: {
	ctx: AutumnContext;
	stripeInvoice: Stripe.Invoice;
	fullCustomer: FullCustomer;
	fullProducts: FullProduct[];
	internalEntityId?: string;
}): Promise<Invoice | undefined> => {
	const invoice = await initInvoiceFromStripe({
		ctx,
		stripeInvoice,
		fullProducts,
		fullCustomer,
		internalEntityId,
	});

	const upsertedInvoice = await InvoiceService.upsert({ db: ctx.db, invoice });

	// Upsert invoice in cache
	if (upsertedInvoice) {
		await upsertInvoiceInCache({
			ctx,
			customerId: fullCustomer.id ?? "",
			invoice: upsertedInvoice,
		});
	}
	return upsertedInvoice;
};

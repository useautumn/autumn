import type { FullCustomer, FullProduct } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { initInvoiceFromStripe } from "@/internal/invoices/utils/initInvoiceFromStripe";
import { upsertInvoiceInCache } from "./cache/upsertInvoiceInCache";
import type { InvoiceUpsertResult } from "./types/invoiceUpsertResult";

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
}): Promise<InvoiceUpsertResult> => {
	const invoice = await initInvoiceFromStripe({
		ctx,
		stripeInvoice,
		fullProducts,
		fullCustomer,
		internalEntityId,
	});

	const upsertedInvoice = await InvoiceService.upsert({ db: ctx.db, invoice });

	const cacheResult = upsertedInvoice
		? await upsertInvoiceInCache({
				ctx,
				customerId: fullCustomer.id ?? "",
				invoice: upsertedInvoice,
			})
		: null;
	return { invoice: upsertedInvoice, cacheResult };
};

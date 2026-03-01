import type { FullCustomer, FullProduct } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { initInvoiceFromStripe } from "@/internal/invoices/utils/initInvoiceFromStripe";

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
	const invoice = await initInvoiceFromStripe({
		ctx,
		stripeInvoice,
		fullProducts,
		fullCustomer,
	});
	await InvoiceService.upsert({ db: ctx.db, invoice });

	return invoice;
};

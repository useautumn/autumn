import { stripeToAtmnAmount } from "@autumn/shared";
import type { Stripe } from "stripe";
import { getInvoiceDiscounts } from "@/external/stripe/stripeInvoiceUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceService } from "../InvoiceService";
import { upsertInvoiceInCache } from "./cache/upsertInvoiceInCache";

export const updateInvoiceFromStripe = async ({
	ctx,
	customerId,
	stripeInvoice,
}: {
	ctx: AutumnContext;
	customerId: string;
	stripeInvoice: Stripe.Invoice;
}) => {
	const updatedInvoice = await InvoiceService.update({
		db: ctx.db,
		query: {
			stripeId: stripeInvoice.id!,
		},
		updates: {
			status: stripeInvoice.status ?? (undefined as string | undefined),
			hosted_invoice_url: stripeInvoice.hosted_invoice_url,
			discounts: getInvoiceDiscounts({
				expandedInvoice: stripeInvoice,
			}),
			total: stripeToAtmnAmount({
				amount: stripeInvoice.total,
				currency: stripeInvoice.currency,
			}),
		},
	});

	if (updatedInvoice) {
		await upsertInvoiceInCache({
			ctx,
			customerId,
			invoice: updatedInvoice,
		});
	}

	return updatedInvoice;
};

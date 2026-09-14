import { ErrCode, ProcessorType, RecaseError } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import { payStripeInvoiceOutOfBand } from "@/external/stripe/invoices/operations/payStripeInvoiceOutOfBand";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { type InvoiceListRow, InvoiceService } from "../InvoiceService";
import { updateInvoiceFromStripe } from "./updateFromStripe";

/** Marks a Stripe invoice paid without charging, then mirrors the result to our row. */
export const payInvoiceOutOfBand = async ({
	ctx,
	invoiceId,
}: {
	ctx: AutumnContext;
	invoiceId: string;
}): Promise<InvoiceListRow> => {
	const row = await InvoiceService.getListRowById({ ctx, id: invoiceId });
	if (!row) {
		throw new RecaseError({
			message: `Invoice ${invoiceId} not found`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const processorType = row.invoice.processor_type ?? ProcessorType.Stripe;
	if (processorType !== ProcessorType.Stripe || !row.invoice.stripe_id) {
		throw new RecaseError({
			message: "Only Stripe invoices can be marked paid out of band",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const stripeInvoice = await getStripeInvoice({
		stripeClient: stripeCli,
		invoiceId: row.invoice.stripe_id,
		expand: [],
	});

	if (stripeInvoice.status !== "open" && stripeInvoice.status !== "paid") {
		throw new RecaseError({
			message: `Invoice ${invoiceId} is ${stripeInvoice.status}; only open invoices can be marked paid`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const paidInvoice = await payStripeInvoiceOutOfBand({
		stripeCli,
		stripeInvoice,
	});

	await updateInvoiceFromStripe({
		ctx,
		customerId: row.customer_id ?? row.invoice.internal_customer_id,
		stripeInvoice: paidInvoice,
	});

	const updated = await InvoiceService.getListRowById({ ctx, id: invoiceId });
	return updated ?? row;
};

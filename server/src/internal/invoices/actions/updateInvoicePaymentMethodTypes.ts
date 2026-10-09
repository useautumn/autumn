import {
	ErrCode,
	type InvoicePaymentMethod,
	ProcessorType,
	RecaseError,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { type InvoiceListRow, InvoiceService } from "../InvoiceService";
import { updateInvoiceFromStripe } from "./updateFromStripe";

const EDITABLE_STRIPE_STATUSES = new Set(["draft", "open"]);

const invalidRequest = (message: string) =>
	new RecaseError({ message, code: ErrCode.InvalidRequest, statusCode: 400 });

/** Changes which payment methods a draft or open Stripe invoice accepts. */
export const updateInvoicePaymentMethodTypes = async ({
	ctx,
	invoiceId,
	paymentMethodTypes,
}: {
	ctx: AutumnContext;
	invoiceId: string;
	paymentMethodTypes: InvoicePaymentMethod[];
}): Promise<InvoiceListRow> => {
	const row = await InvoiceService.getListRowById({ ctx, id: invoiceId });
	if (!row) throw invalidRequest(`Invoice ${invoiceId} not found`);

	const processorType = row.invoice.processor_type ?? ProcessorType.Stripe;
	if (processorType !== ProcessorType.Stripe || !row.invoice.stripe_id) {
		throw invalidRequest("Only Stripe invoices can be updated");
	}

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const stripeInvoice = await stripeCli.invoices.retrieve(
		row.invoice.stripe_id,
	);

	if (!EDITABLE_STRIPE_STATUSES.has(stripeInvoice.status ?? "")) {
		throw invalidRequest(
			`Invoice ${invoiceId} is ${stripeInvoice.status}; only draft or open invoices can be updated`,
		);
	}

	const updatedInvoice = await stripeCli.invoices.update(stripeInvoice.id, {
		payment_settings: { payment_method_types: paymentMethodTypes },
	});

	await updateInvoiceFromStripe({
		ctx,
		customerId: row.customer_id ?? row.invoice.internal_customer_id,
		stripeInvoice: updatedInvoice,
	});

	return (await InvoiceService.getListRowById({ ctx, id: invoiceId })) ?? row;
};

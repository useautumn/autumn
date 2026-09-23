import { ErrCode, ProcessorType, RecaseError } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { expirePendingPlanForVoidedInvoice } from "@/internal/billing/v2/actions/expirePendingPlan/expirePendingPlanForVoidedInvoice";
import { type InvoiceListRow, InvoiceService } from "../InvoiceService";
import { updateInvoiceFromStripe } from "./updateFromStripe";

const VOIDABLE_STRIPE_STATUSES = new Set(["open", "uncollectible"]);

/**
 * Voids a finalized, unpaid Stripe invoice. Stripe re-derives subscription
 * status from the remaining invoices, and the webhook mirrors that separately.
 */
export const voidInvoice = async ({
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
			message: "Only Stripe invoices can be voided",
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

	const customerId = row.customer_id ?? row.invoice.internal_customer_id;

	if (stripeInvoice.status === "void") {
		await expirePendingPlanForVoidedInvoice({
			ctx,
			stripeInvoice,
			customerId,
		});
		await updateInvoiceFromStripe({ ctx, customerId, stripeInvoice });
		return (await InvoiceService.getListRowById({ ctx, id: invoiceId })) ?? row;
	}

	if (!VOIDABLE_STRIPE_STATUSES.has(stripeInvoice.status ?? "")) {
		throw new RecaseError({
			message: `Invoice ${invoiceId} is ${stripeInvoice.status}; only open or uncollectible invoices can be voided`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const voidedInvoice = await stripeCli.invoices.voidInvoice(stripeInvoice.id);

	await expirePendingPlanForVoidedInvoice({
		ctx,
		stripeInvoice: voidedInvoice,
		customerId,
	});
	await updateInvoiceFromStripe({
		ctx,
		customerId,
		stripeInvoice: voidedInvoice,
	});

	const updated = await InvoiceService.getListRowById({ ctx, id: invoiceId });
	return updated ?? row;
};

import { ErrCode, ProcessorType, RecaseError } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { schedulePendingPlanExpiryForFinalizedInvoice } from "@/internal/billing/v2/actions/expirePendingPlan/schedulePendingPlanExpiryForFinalizedInvoice";
import {
	finalizeStripeInvoice,
	updateStripeInvoice,
} from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import { type InvoiceListRow, InvoiceService } from "../InvoiceService";
import { assertInvoiceNotReissued } from "../invoiceUtils/assertInvoiceNotReissued";
import { updateInvoiceFromStripe } from "./updateFromStripe";

const ALREADY_FINALIZED_STRIPE_STATUSES = new Set(["open", "paid"]);

/** Finalizes a draft Stripe invoice and hands collection to Stripe. */
export const finalizeInvoice = async ({
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
			message: "Only Stripe invoices can be finalized",
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

	assertInvoiceNotReissued({ invoiceId, stripeInvoice });

	const customerId = row.customer_id ?? row.invoice.internal_customer_id;

	if (ALREADY_FINALIZED_STRIPE_STATUSES.has(stripeInvoice.status ?? "")) {
		await schedulePendingPlanExpiryForFinalizedInvoice({ ctx, stripeInvoice });
		await updateInvoiceFromStripe({ ctx, customerId, stripeInvoice });
		return (await InvoiceService.getListRowById({ ctx, id: invoiceId })) ?? row;
	}

	if (stripeInvoice.status !== "draft") {
		throw new RecaseError({
			message: `Invoice ${invoiceId} is ${stripeInvoice.status}; only draft invoices can be finalized`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// Invoice-mode drafts are parked with auto_advance off, and finalize alone does not turn it back on.
	await updateStripeInvoice({
		stripeCli,
		invoiceId: stripeInvoice.id,
		params: { auto_advance: true },
	});
	let finalizedInvoice: Stripe.Invoice;
	try {
		finalizedInvoice = await finalizeStripeInvoice({
			stripeCli,
			invoiceId: stripeInvoice.id,
			autoAdvance: true,
		});
	} catch (error) {
		// Left on, Stripe would finalize and collect the draft on its own.
		await updateStripeInvoice({
			stripeCli,
			invoiceId: stripeInvoice.id,
			params: { auto_advance: false },
		}).catch(() => undefined);
		throw error;
	}

	await schedulePendingPlanExpiryForFinalizedInvoice({
		ctx,
		stripeInvoice: finalizedInvoice,
	});
	await updateInvoiceFromStripe({
		ctx,
		customerId,
		stripeInvoice: finalizedInvoice,
	});

	const updated = await InvoiceService.getListRowById({ ctx, id: invoiceId });
	return updated ?? row;
};

import type { BillingContext } from "@autumn/shared";
import {
	type PayInvoiceResult,
	payStripeInvoice,
} from "@server/internal/billing/v2/providers/stripe/utils/invoices/payStripeInvoice";
import {
	addStripeInvoiceLines,
	createStripeInvoice,
	finalizeStripeInvoice,
} from "@server/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type {
	StripeInvoiceAction,
	StripeInvoiceMetadata,
} from "@autumn/shared";

export const createInvoiceForBilling = async ({
	ctx,
	billingContext,
	stripeInvoiceAction,
	invoiceMetadata,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	stripeInvoiceAction: StripeInvoiceAction;
	invoiceMetadata?: StripeInvoiceMetadata;
}): Promise<PayInvoiceResult> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const { addLineParams } = stripeInvoiceAction;
	const { invoiceMode } = billingContext;

	const shouldFinalizeInvoice = invoiceMode
		? invoiceMode.finalizeInvoice
		: true;

	const isInvoiceMode = Boolean(invoiceMode);

	const collectionMethod = isInvoiceMode
		? "send_invoice"
		: "charge_automatically";

	const draftInvoice = await createStripeInvoice({
		stripeCli,
		stripeCusId: billingContext.stripeCustomer.id,
		metadata: invoiceMetadata,
		collectionMethod,
	});

	const invoiceWithLines = await addStripeInvoiceLines({
		stripeCli,
		invoiceId: draftInvoice.id,
		lines: addLineParams.lines,
	});

	if (!shouldFinalizeInvoice) {
		return { paid: false, invoice: invoiceWithLines };
	}

	const finalizedInvoice = await finalizeStripeInvoice({
		stripeCli,
		invoiceId: invoiceWithLines.id,
	});

	if (finalizedInvoice.status === "paid") {
		return { paid: true, invoice: finalizedInvoice };
	}

	if (isInvoiceMode) {
		return { paid: false, invoice: finalizedInvoice };
	}

	return payStripeInvoice({
		stripeCli,
		invoiceId: finalizedInvoice.id,
		paymentMethod: billingContext.paymentMethod,
	});
};

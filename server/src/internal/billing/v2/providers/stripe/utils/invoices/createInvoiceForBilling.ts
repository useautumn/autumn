import type { BillingContext } from "@server/internal/billing/v2/billingContext";
import type {
	StripeInvoiceAction,
	StripeInvoiceMetadata,
} from "@server/internal/billing/v2/billingPlan";
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
	const { addLineParams, invoiceMode } = stripeInvoiceAction;
	const shouldFinalizeInvoice = invoiceMode ? invoiceMode.finalizeInvoice : true;
	const shouldPayImmediately = invoiceMode ? invoiceMode.enableProductImmediately : true;

	const draftInvoice = await createStripeInvoice({
		stripeCli,
		stripeCusId: billingContext.stripeCustomer.id,
		metadata: invoiceMetadata,
	});

	await addStripeInvoiceLines({
		stripeCli,
		invoiceId: draftInvoice.id,
		lines: addLineParams.lines,
	});

	if (!shouldFinalizeInvoice) {
		return { paid: false, invoice: draftInvoice };
	}

	const finalizedInvoice = await finalizeStripeInvoice({
		stripeCli,
		invoiceId: draftInvoice.id,
	});

	if (finalizedInvoice.status === "paid") {
		return { paid: true, invoice: finalizedInvoice };
	}

	if (!shouldPayImmediately) {
		return { paid: false, invoice: finalizedInvoice };
	}

	return payStripeInvoice({
		stripeCli,
		invoiceId: finalizedInvoice.id,
		paymentMethod: billingContext.paymentMethod,
		onFailure: "return_url",
	});
};

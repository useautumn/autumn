import type Stripe from "stripe";
import {
	type PayInvoiceResult,
	type PaymentFailureMode,
	payStripeInvoice,
} from "./payStripeInvoice";
import {
	addStripeInvoiceLines,
	createStripeInvoice,
	finalizeStripeInvoice,
} from "./stripeInvoiceOps";

// ============================================
// Types
// ============================================

export type CreateAndPayInvoiceParams = {
	stripeCli: Stripe;
	stripeCusId: string;
	stripeSubId?: string;
	stripeLineItems: Stripe.InvoiceAddLinesParams.Line[];
	paymentMethod?: Stripe.PaymentMethod | null;
	discounts?: { coupon: string }[];
	description?: string;
	onPaymentFailure?: PaymentFailureMode;
};

export type CreateAndPayInvoiceResult = PayInvoiceResult;

// ============================================
// Create and Pay Invoice
// ============================================

/**
 * Full invoice workflow: create → add lines → finalize → pay
 */
export const createAndPayInvoice = async ({
	stripeCli,
	stripeCusId,
	stripeSubId,
	stripeLineItems,
	paymentMethod,
	description,
	onPaymentFailure = "return_url",
}: CreateAndPayInvoiceParams): Promise<CreateAndPayInvoiceResult> => {
	// 2. Create draft invoice
	const invoice = await createStripeInvoice({
		stripeCli,
		stripeCusId,
		stripeSubId,
		description,
	});

	// 3. Add lines to invoice
	await addStripeInvoiceLines({
		stripeCli,
		invoiceId: invoice.id,
		lines: stripeLineItems,
	});

	// 4. Finalize invoice
	const finalizedInvoice = await finalizeStripeInvoice({
		stripeCli,
		invoiceId: invoice.id,
	});

	// 5. If already paid (e.g. total <= 0), return early
	if (finalizedInvoice.status === "paid") {
		return {
			paid: true,
			invoice: finalizedInvoice,
		};
	}

	// 6. Pay invoice
	return payStripeInvoice({
		stripeCli,
		invoiceId: finalizedInvoice.id,
		paymentMethod,
		onFailure: onPaymentFailure,
	});
};

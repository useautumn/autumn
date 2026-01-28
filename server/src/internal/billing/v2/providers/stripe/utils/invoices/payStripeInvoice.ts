import { type PaymentFailureCode, tryCatch } from "@autumn/shared";
import type Stripe from "stripe";
import { handleInvoicePaymentFailure } from "./handleInvoicePaymentFailure";

// ============================================
// Types
// ============================================

export type PayInvoiceResult = {
	paid: boolean;
	invoice: Stripe.Invoice;
	requiredAction?: {
		code: PaymentFailureCode;
		reason: string;
	};
	stripeError?: Stripe.errors.StripeError;
};

type PayStripeInvoiceParams = {
	stripeCli: Stripe;
	invoiceId: string;
	paymentMethod?: Stripe.PaymentMethod | null;
};

// ============================================
// Pay Invoice
// ============================================

export const payStripeInvoice = async ({
	stripeCli,
	invoiceId,
	paymentMethod,
}: PayStripeInvoiceParams): Promise<PayInvoiceResult> => {
	// 1. Retrieve invoice to check status
	const invoice = await stripeCli.invoices.retrieve(invoiceId);

	// 2. Already paid - return success
	if (invoice.status === "paid") {
		return {
			paid: true,
			invoice,
		};
	}

	// 3. No payment method - return failure
	if (!paymentMethod) {
		return handleInvoicePaymentFailure({
			invoice,
			error: "no_payment_method",
		});
	}

	// 4. Attempt payment
	const { data: paidInvoice, error } = await tryCatch(
		stripeCli.invoices.pay(invoiceId, {
			payment_method: paymentMethod.id,
		}),
	);

	if (error) {
		return handleInvoicePaymentFailure({ invoice, error });
	}

	return {
		paid: true,
		invoice: paidInvoice,
	};
};

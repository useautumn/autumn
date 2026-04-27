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
	invoice: Stripe.Invoice;
	paymentMethod?: Stripe.PaymentMethod | null;
};

// ============================================
// Pay Invoice
// ============================================

export const payStripeInvoice = async ({
	stripeCli,
	invoice,
	paymentMethod,
}: PayStripeInvoiceParams): Promise<PayInvoiceResult> => {
	// 1. Already paid - return success
	if (invoice.status === "paid") {
		return {
			paid: true,
			invoice,
		};
	}

	// 2. No payment method - return failure
	if (!paymentMethod) {
		return handleInvoicePaymentFailure({
			invoice,
			error: "no_payment_method",
		});
	}

	// 3. Attempt payment
	const { data: paidInvoice, error } = await tryCatch(
		stripeCli.invoices.pay(invoice.id, {
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

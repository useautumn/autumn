import { ErrCode } from "@autumn/shared";
import type Stripe from "stripe";
import RecaseError from "@/utils/errorUtils.js";

// ============================================
// Types
// ============================================

export type PaymentFailureMode =
	| "return_url"
	| "checkout_session"
	| "throw"
	| "void";

export type PayInvoiceResult = {
	paid: boolean;
	invoice: Stripe.Invoice;
	hostedUrl?: string;
	error?: Error;
	createCheckoutSession?: boolean;
};

export type PayStripeInvoiceParams = {
	stripeCli: Stripe;
	invoiceId: string;
	paymentMethod?: Stripe.PaymentMethod | null;
	onFailure?: PaymentFailureMode;
};

// ============================================
// Pay Invoice
// ============================================

export const payStripeInvoice = async ({
	stripeCli,
	invoiceId,
	paymentMethod,
	onFailure = "return_url",
}: PayStripeInvoiceParams): Promise<PayInvoiceResult> => {
	// 1. Retrieve invoice to check status
	let invoice = await stripeCli.invoices.retrieve(invoiceId);

	// 2. Already paid - return success
	if (invoice.status === "paid") {
		return {
			paid: true,
			invoice,
		};
	}

	// 3. No payment method - handle based on failure mode
	if (!paymentMethod) {
		return handlePaymentFailure({
			stripeCli,
			invoice,
			onFailure,
			error: new RecaseError({
				message: "No payment method found",
				code: ErrCode.CustomerHasNoPaymentMethod,
				statusCode: 400,
			}),
		});
	}

	// 4. Attempt payment
	try {
		invoice = await stripeCli.invoices.pay(invoiceId, {
			payment_method: paymentMethod.id,
		});

		return {
			paid: true,
			invoice,
		};
	} catch (err) {
		const errMessage =
			err instanceof Error ? err.message : "Failed to pay invoice";

		return handlePaymentFailure({
			stripeCli,
			invoice,
			onFailure,
			error: new RecaseError({
				message: errMessage,
				code: ErrCode.PayInvoiceFailed,
				statusCode: 400,
			}),
		});
	}
};

// ============================================
// Handle Payment Failure
// ============================================

const handlePaymentFailure = async ({
	stripeCli,
	invoice,
	onFailure,
	error,
}: {
	stripeCli: Stripe;
	invoice: Stripe.Invoice;
	onFailure: PaymentFailureMode;
	error: Error;
}): Promise<PayInvoiceResult> => {
	switch (onFailure) {
		case "throw":
			throw error;

		case "checkout_session":
			return {
				paid: false,
				invoice,
				hostedUrl: undefined,
				error,
				createCheckoutSession: true,
			};

		case "void":
			try {
				await stripeCli.invoices.voidInvoice(invoice.id!);
			} catch (_voidError) {
				// Silently fail void attempt
			}
			return {
				paid: false,
				invoice,
				error,
			};

		default:
			return {
				paid: false,
				invoice,
				hostedUrl: invoice.hosted_invoice_url || undefined,
				error,
			};
	}
};

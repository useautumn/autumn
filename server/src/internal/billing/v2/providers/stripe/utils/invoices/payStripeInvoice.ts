import { type PaymentFailureCode, tryCatch } from "@autumn/shared";
import type Stripe from "stripe";
import { autumnStripeRequestOptions } from "@/external/stripe/common/autumnStripeIdempotency";
import { handleInvoicePaymentFailure } from "./handleInvoicePaymentFailure";

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

export const payStripeInvoice = async ({
	stripeCli,
	invoice,
	paymentMethod,
}: PayStripeInvoiceParams): Promise<PayInvoiceResult> => {
	if (invoice.status === "paid") {
		return {
			paid: true,
			invoice,
		};
	}

	if (!paymentMethod) {
		return handleInvoicePaymentFailure({
			invoice,
			error: "no_payment_method",
		});
	}

	if (paymentMethod.type === "custom") {
		return {
			paid: false,
			invoice,
			requiredAction: {
				code: "payment_method_required",
				reason: "Custom payment method requires out-of-band payment",
			},
		};
	}

	const { data: paidInvoice, error } = await tryCatch(
		stripeCli.invoices.pay(
			invoice.id,
			{
				payment_method: paymentMethod.id,
			},
			autumnStripeRequestOptions({ source: "invoice.pay" }),
		),
	);

	if (error) {
		return handleInvoicePaymentFailure({ invoice, error });
	}

	if (paidInvoice.status !== "paid") {
		const isProcessing = paidInvoice.status === "open";
		return {
			paid: false,
			invoice: paidInvoice,
			requiredAction: {
				code: isProcessing ? "payment_processing" : "payment_failed",
				reason: `Invoice is ${paidInvoice.status ?? "not paid"}`,
			},
		};
	}

	return {
		paid: true,
		invoice: paidInvoice,
	};
};

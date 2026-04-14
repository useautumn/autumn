import {
	atmnToStripeAmount,
	ErrCode,
	RecaseError,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";

/** Resolve the Stripe charge from an invoice's payments list */
export const resolveChargeFromInvoice = async ({
	stripeCli,
	stripeInvoice,
}: {
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
}): Promise<Stripe.Charge | null> => {
	const payments = stripeInvoice.payments?.data ?? [];
	const paidPayments = payments.filter((p) => p.status === "paid");

	if (paidPayments.length === 0) return null;

	if (paidPayments.length > 1) {
		throw new RecaseError({
			message:
				"This invoice has multiple payments and cannot be refunded via Autumn, please visit the Stripe dashboard to perform this action.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const { payment } = paidPayments[0];

	if (payment.type === "charge" && payment.charge) {
		if (typeof payment.charge === "string") {
			return stripeCli.charges.retrieve(payment.charge);
		}
		return payment.charge;
	}

	if (payment.type === "payment_intent" && payment.payment_intent) {
		const paymentIntentId =
			typeof payment.payment_intent === "string"
				? payment.payment_intent
				: payment.payment_intent.id;

		const paymentIntent = await stripeCli.paymentIntents.retrieve(
			paymentIntentId,
			{ expand: ["latest_charge"] },
		);

		const latestCharge = paymentIntent.latest_charge;
		if (!latestCharge || typeof latestCharge === "string") return null;
		return latestCharge;
	}

	return null;
};

/** Validate that the charge is refundable and return the refundable amount in cents */
export const validateChargeRefundable = ({
	charge,
}: {
	charge: Stripe.Charge;
}): number => {
	if (!charge.paid || charge.status !== "succeeded") {
		throw new RecaseError({
			message: "This charge is not eligible for a refund",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const refundableAmountInCents = charge.amount - charge.amount_refunded;

	if (refundableAmountInCents <= 0) {
		throw new RecaseError({
			message: "This charge has already been fully refunded",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return refundableAmountInCents;
};

/** Calculate the refund amount in cents based on mode and optional user-provided amount */
export const calculateRefundAmountInCents = ({
	mode,
	amount,
	refundableAmountInCents,
	currency,
}: {
	mode: "full" | "partial";
	amount?: number;
	refundableAmountInCents: number;
	currency: string;
}): number => {
	if (mode === "full") return refundableAmountInCents;

	if (!amount) {
		throw new RecaseError({
			message: "Amount is required for partial refunds",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const refundAmountInCents = atmnToStripeAmount({ amount, currency });

	if (refundAmountInCents > refundableAmountInCents) {
		const refundableDisplay = stripeToAtmnAmount({
			amount: refundableAmountInCents,
			currency,
		});
		throw new RecaseError({
			message: `Refund amount exceeds the refundable balance of ${refundableDisplay} ${currency.toUpperCase()}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return refundAmountInCents;
};

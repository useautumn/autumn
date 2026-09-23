import { ErrCode, RecaseError } from "@autumn/shared";
import Stripe from "stripe";

const invalidRequest = (message: string) =>
	new RecaseError({ message, code: ErrCode.InvalidRequest, statusCode: 400 });

/** Rejects a payment method that cannot pay this replacement before anything is written. */
export const assertReissuePaymentMethod = async ({
	stripeCli,
	stripeCustomerId,
	paymentMethodId,
	collectionMethod,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
	paymentMethodId?: string;
	collectionMethod: "send_invoice" | "charge_automatically";
}) => {
	if (!paymentMethodId) return;
	if (collectionMethod !== "charge_automatically") {
		throw invalidRequest(
			"payment_method_id only applies to replacements charged automatically; remove net_terms_days or the payment method",
		);
	}

	const paymentMethod = await stripeCli.paymentMethods
		.retrieve(paymentMethodId)
		.catch((error: unknown) => {
			if (
				error instanceof Stripe.errors.StripeInvalidRequestError &&
				error.code === "resource_missing"
			) {
				return null;
			}
			throw error;
		});
	const ownerId =
		typeof paymentMethod?.customer === "string"
			? paymentMethod.customer
			: paymentMethod?.customer?.id;
	if (ownerId !== stripeCustomerId) {
		throw invalidRequest(
			`Payment method ${paymentMethodId} does not belong to this customer`,
		);
	}
};

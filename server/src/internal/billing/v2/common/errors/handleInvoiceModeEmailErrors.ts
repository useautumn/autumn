import { ErrCode, type FullCustomer, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";

/** Invoice mode delivers the invoice by email, so Stripe rejects finalization
 * when neither Autumn nor Stripe holds an email for the customer. */
export const handleInvoiceModeEmailErrors = ({
	fullCustomer,
	stripeCustomer,
}: {
	fullCustomer: FullCustomer;
	stripeCustomer?: Stripe.Customer;
}) => {
	const hasEmail = Boolean(
		fullCustomer.email?.trim() || stripeCustomer?.email?.trim(),
	);
	if (hasEmail) return;

	throw new RecaseError({
		message:
			`Customer ${fullCustomer.id ?? fullCustomer.internal_id} has no email. ` +
			"Invoice mode sends the invoice by email — set an email on the customer first.",
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};

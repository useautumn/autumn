import { ErrCode, type FullCustomer, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import { customerHasInvoiceEmail } from "@/internal/billing/v2/utils/invoiceMode/customerHasInvoiceEmail";

/** Stripe rejects finalizing an invoice-mode invoice when the customer has no email. */
export const handleInvoiceModeEmailErrors = ({
	fullCustomer,
	stripeCustomer,
}: {
	fullCustomer: FullCustomer;
	stripeCustomer?: Stripe.Customer;
}) => {
	if (customerHasInvoiceEmail({ fullCustomer, stripeCustomer })) return;

	throw new RecaseError({
		message:
			`Customer ${fullCustomer.id ?? fullCustomer.internal_id} has no email. ` +
			"Invoice mode sends the invoice by email — set an email on the customer first.",
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};

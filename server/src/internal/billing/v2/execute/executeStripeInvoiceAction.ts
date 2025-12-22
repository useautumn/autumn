import { createStripeCli } from "../../../../external/connect/createStripeCli";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { createAndPayInvoice } from "../../billingUtils/stripeAdapter/stripeInvoiceOps/createAndPayInvoice";
import type {
	AttachContext,
	StripeCheckoutAction,
	StripeInvoiceAction,
} from "../typesOld";
import { executeStripeCheckoutAction } from "./executeStripeCheckoutAction";

export const executeStripeInvoiceAction = async ({
	ctx,
	attachContext,
	stripeCheckoutAction,
	stripeInvoiceAction,
}: {
	ctx: AutumnContext;
	attachContext: AttachContext;
	stripeCheckoutAction: StripeCheckoutAction;
	stripeInvoiceAction: StripeInvoiceAction;
}) => {
	const { org, env, logger } = ctx;
	const { items, onPaymentFailure } = stripeInvoiceAction;

	const stripeCli = createStripeCli({ org, env });

	// 1. Create and pay invoice
	const { invoice, paid, error, createCheckoutSession, hostedUrl } =
		await createAndPayInvoice({
			stripeCli,
			stripeCusId: attachContext.stripeCus.id,
			stripeLineItems: items,
			paymentMethod: attachContext.paymentMethod,
			onPaymentFailure: onPaymentFailure,
		});

	if (!paid) {
		// 1. Either return checkout session, hosted url, or throw error
		if (createCheckoutSession) {
			return await executeStripeCheckoutAction({
				ctx,
				stripeCheckoutAction: stripeCheckoutAction,
			});
		}

		if (hostedUrl) {
			return hostedUrl;
		}

		throw error;
	}

	return invoice;
};

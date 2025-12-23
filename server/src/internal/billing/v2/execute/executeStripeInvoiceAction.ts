import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { createStripeCli } from "../../../../external/connect/createStripeCli";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import type { StripeInvoiceAction } from "../billingPlan";
import { createAndPayInvoice } from "../providers/stripe/utils/invoices/createAndPayInvoice";

export const executeStripeInvoiceAction = async ({
	ctx,
	billingContext,
	stripeInvoiceAction,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	stripeInvoiceAction: StripeInvoiceAction;
}) => {
	const { org, env } = ctx;
	const { addLineParams } = stripeInvoiceAction;

	const stripeCli = createStripeCli({ org, env });

	// 1. Create and pay invoice
	const result = await createAndPayInvoice({
		stripeCli,
		stripeCusId: billingContext.stripeCustomer?.id,
		stripeLineItems: addLineParams.lines,
		paymentMethod: billingContext.paymentMethod,
		onPaymentFailure: "return_url",
	});

	return result;
};

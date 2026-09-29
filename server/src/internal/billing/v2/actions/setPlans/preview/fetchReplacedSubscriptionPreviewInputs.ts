import type { BillingContext, FullCusProduct } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems";

/** What the replaced subscription leaves behind: open invoices and arrear usage it never bills. */
export const fetchReplacedSubscriptionPreviewInputs = async ({
	ctx,
	billingContext,
	outgoingCustomerProducts,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	outgoingCustomerProducts: FullCusProduct[];
}) => {
	const replacedStripeSubscription = billingContext.replacedStripeSubscription;
	if (!replacedStripeSubscription) {
		return { replacedOpenInvoices: [], unbilledUsageLineItems: [] };
	}

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const { data: replacedOpenInvoices } = await stripeCli.invoices.list({
		subscription: replacedStripeSubscription.id,
		status: "open",
	});

	const unbilledUsageLineItems = outgoingCustomerProducts
		.filter((customerProduct) =>
			customerProduct.subscription_ids?.includes(replacedStripeSubscription.id),
		)
		.flatMap(
			(customerProduct) =>
				customerProductToArrearLineItems({
					ctx,
					customerProduct,
					billingContext: {
						...billingContext,
						stripeSubscription: replacedStripeSubscription,
					},
					options: {
						includePeriodDescription: false,
						updateNextResetAt: false,
						discountable: false,
					},
				}).lineItems,
		);

	return { replacedOpenInvoices, unbilledUsageLineItems };
};

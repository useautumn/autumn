import {
	type BillingContext,
	type BillingPlan,
	CustomerTaxLocationMissingError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { requiresTaxLocation } from "@/internal/billing/v2/providers/stripe/utils/tax/shouldEnableStripeAutomaticTax";

const createsTaxableStripeDocuments = ({
	billingPlan,
}: {
	billingPlan: BillingPlan;
}) =>
	Boolean(
		billingPlan.stripe.invoiceAction ||
			billingPlan.stripe.subscriptionAction ||
			billingPlan.stripe.subscriptionScheduleAction,
	);

export const handleTaxLocationErrors = ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) => {
	if (!createsTaxableStripeDocuments({ billingPlan })) return;
	if (!requiresTaxLocation({ ctx, billingContext })) return;

	throw new CustomerTaxLocationMissingError({
		customerId:
			billingContext.fullCustomer.id ?? billingContext.fullCustomer.internal_id,
	});
};

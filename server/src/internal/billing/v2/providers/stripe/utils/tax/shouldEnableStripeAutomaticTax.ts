import type { BillingContext } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const hasUsableTaxAddress = (address?: Stripe.Address | null) => {
	return Boolean(address?.country);
};

export const customerHasUsableTaxLocationForStripeTax = (
	stripeCustomer?: Stripe.Customer,
) => {
	if (!stripeCustomer) return false;

	if (stripeCustomer.tax?.automatic_tax) {
		return ["supported", "not_collecting"].includes(
			stripeCustomer.tax.automatic_tax,
		);
	}

	return (
		hasUsableTaxAddress(stripeCustomer.address) ||
		hasUsableTaxAddress(stripeCustomer.shipping?.address)
	);
};

export const isTaxExemptCustomer = ({
	billingContext,
}: {
	billingContext: BillingContext;
}) =>
	(billingContext.billingDetails?.tax_exempt ??
		billingContext.stripeCustomer?.tax_exempt) === "exempt";

/** The request should be taxed automatically, ignoring whether a tax location exists yet. */
export const wantsStripeAutomaticTax = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}) => {
	if (!ctx.org.config.automatic_tax) return false;
	if (billingContext.automaticTaxEnabled === false) return false;
	return !billingContext.taxRateId;
};

/** Invoice mode has no address collection, so a missing location must block instead of silently skipping tax. */
export const requiresTaxLocation = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}) => {
	if (!billingContext.invoiceMode) return false;
	if (!wantsStripeAutomaticTax({ ctx, billingContext })) return false;
	if (isTaxExemptCustomer({ billingContext })) return false;
	if (billingContext.billingDetails?.address?.country) return false;
	return !customerHasUsableTaxLocationForStripeTax(
		billingContext.stripeCustomer,
	);
};

export const shouldEnableStripeAutomaticTax = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}) => {
	if (!wantsStripeAutomaticTax({ ctx, billingContext })) return false;

	// Use only the already-fetched Stripe customer. If setup did not fetch one,
	// do not fetch again on the write path.
	return customerHasUsableTaxLocationForStripeTax(
		billingContext.stripeCustomer,
	);
};

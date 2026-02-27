import type { BillingVersion } from "@autumn/shared";

export type ExpectStripeSubOptions = {
	status?: "active" | "trialing";
	shouldBeCanceled?: boolean;
	subId?: string;
	subCount?: number;
	rewards?: string[];
	billingVersion?: BillingVersion;
	debug?: boolean;
};

export type NormalizedItem = {
	priceId?: string;
	autumnCustomerPriceId?: string;
	quantity: number;
	isInline: boolean;
	/** Stripe unit_amount_decimal (string, in smallest currency unit). Present for inline prices. */
	unitAmountDecimal?: string;
};

export type NormalizedItem = {
	priceId?: string;
	autumnCustomerPriceId?: string;
	quantity: number;
	isInline: boolean;
	/** Stripe unit_amount_decimal (string, in smallest currency unit). Present for inline prices. */
	unitAmountDecimal?: string;
};

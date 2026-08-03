export type NormalizedItem = {
	priceId?: string;
	autumnCustomerPriceId?: string;
	quantity: number;
	isInline: boolean;
	/** Stripe unit_amount_decimal (string, in smallest currency unit). Present for inline prices. */
	unitAmountDecimal?: string;
	/** Rendered in explicit inline mode (e.g. the price has no stored Stripe
	 * ids) — compare economic totals, not per-field quantity/amount. */
	inlineMode?: boolean;
};

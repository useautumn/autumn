export const BILLING_UNITS = 100;
export const PRICE_PER_UNIT = 10;
export const INCLUDED_USAGE = 100;

export const PRO_BASE = 20;
export const PREMIUM_BASE = 50;

/** Prepaid cost for a given quantity: (qty - included) / billingUnits * price */
export const prepaidCost = (quantity: number) =>
	((quantity - INCLUDED_USAGE) / BILLING_UNITS) * PRICE_PER_UNIT;

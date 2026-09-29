import type { ProcessorItem, ProcessorItemPrice } from "@autumn/shared";

export const monthlyPrice = (unitAmount: number): ProcessorItemPrice => ({
	currency: "usd",
	unit_amount: unitAmount,
	interval: "month",
	interval_count: 1,
	usage_type: "licensed",
	tiers_mode: null,
	first_tier_amount: null,
	units_per_quantity: null,
});

export const processorItem = (
	overrides: Partial<ProcessorItem> = {},
): ProcessorItem => ({
	price_id: "price_premium",
	plan_id: "premium",
	feature_id: null,
	display_name: "Premium",
	feature_name: null,
	quantity: 1,
	price: monthlyPrice(50),
	amount: 50,
	creates_price: false,
	managed_by_autumn: true,
	...overrides,
});

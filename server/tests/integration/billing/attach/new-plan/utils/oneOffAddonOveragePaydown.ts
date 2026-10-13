import { expect } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";

export const INCLUDED_PER_BALANCE = 15_000_000;
export const OVERAGE = 127_803;
export const PURCHASED_CREDITS = 5_000_000;

export const buildScenarioProducts = () => {
	const recurringPlan = products.base({
		id: "recurring-plan",
		items: [
			items.annualPrice({ price: 200 }),
			items.monthlyMessages({ includedUsage: INCLUDED_PER_BALANCE }),
			items.lifetimeMessages({ includedUsage: INCLUDED_PER_BALANCE }),
		],
		billingControls: {
			overage_allowed: [{ feature_id: TestFeature.Messages, enabled: true }],
		},
	});
	const oneOffAddOn = products.oneOffAddOn({
		id: "credit-add-on",
		items: [
			items.oneOffMessages({
				billingUnits: PURCHASED_CREDITS,
				price: 10,
			}),
		],
	});

	return { recurringPlan, oneOffAddOn };
};

export const findPlanBreakdown = ({
	customer,
	planId,
	interval,
}: {
	customer: ApiCustomerV5;
	planId: string;
	interval: "month" | "one_off";
}) => {
	const breakdown = customer.balances[TestFeature.Messages].breakdown?.find(
		(item) => item.plan_id === planId && item.reset?.interval === interval,
	);

	expect(breakdown).toBeDefined();
	return breakdown!;
};

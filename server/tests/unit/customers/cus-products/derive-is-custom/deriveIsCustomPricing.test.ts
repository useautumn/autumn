import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	Infinite,
	type Price,
	type UsageTier,
} from "@autumn/shared";
import {
	asCustomRow,
	basePrice,
	catalogPlan,
	customerPlan,
	derive,
	includedItem,
	type PlanItemRows,
	payPerUseItem,
	prepaidItem,
} from "./isCustomFixtures";

type PricingCase = {
	name: string;
	catalog: { prices?: Price[]; items?: PlanItemRows[] };
	customer: { prices?: Price[]; items?: PlanItemRows[] };
	custom: boolean;
};

const runCases = (cases: PricingCase[]) =>
	test.each(cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
		expect(
			derive({
				customer: customerPlan(c.customer),
				catalog: catalogPlan(c.catalog),
			}).isCustom,
		).toBe(c.custom);
	});

const tiersIn = (amount: number): UsageTier[] => [{ to: Infinite, amount }];

describe("deriveCustomerProductIsCustom pricing", () => {
	describe("base price", () => {
		runCases([
			{
				name: "same amount on a legacy Stripe price → not custom",
				catalog: { prices: [basePrice({ stripePriceId: "price_current" })] },
				customer: {
					prices: [asCustomRow(basePrice({ stripePriceId: "price_2023" }))],
				},
				custom: false,
			},
			{
				name: "a whole legacy plan re-minted with the same terms → not custom",
				catalog: {
					prices: [basePrice()],
					items: [
						includedItem(),
						prepaidItem({
							entitlementId: "ent_credits_prepaid",
							priceId: "pr_credits_prepaid",
						}),
					],
				},
				customer: {
					prices: [asCustomRow(basePrice())],
					items: [
						asCustomRow(includedItem()),
						asCustomRow(
							prepaidItem({
								entitlementId: "ent_credits_prepaid",
								priceId: "pr_credits_prepaid",
							}),
						),
					],
				},
				custom: false,
			},
			{
				name: "different amount → custom",
				catalog: { prices: [basePrice({ amount: 49 })] },
				customer: { prices: [basePrice({ amount: 39 })] },
				custom: true,
			},
			{
				name: "different interval → custom",
				catalog: { prices: [basePrice({ interval: BillingInterval.Month })] },
				customer: { prices: [basePrice({ interval: BillingInterval.Year })] },
				custom: true,
			},
			{
				name: "free for the customer, paid in the plan → custom",
				catalog: { prices: [basePrice()] },
				customer: { prices: [] },
				custom: true,
			},
			{
				name: "paid for the customer, free in the plan → custom",
				catalog: { prices: [] },
				customer: { prices: [basePrice()] },
				custom: true,
			},
		]);
	});

	// Other currencies are a purchase-time option, so only an amount that moved in
	// a currency both sides price in counts.
	describe("multi-currency", () => {
		runCases([
			{
				name: "plan gains a currency the customer lacks → not custom",
				catalog: {
					prices: [basePrice({ currencies: { gbp: { amount: 39 } } })],
				},
				customer: { prices: [basePrice()] },
				custom: false,
			},
			{
				name: "customer holds a currency the plan dropped → not custom",
				catalog: { prices: [basePrice()] },
				customer: {
					prices: [basePrice({ currencies: { gbp: { amount: 39 } } })],
				},
				custom: false,
			},
			{
				name: "same amounts in every currency → not custom",
				catalog: {
					prices: [
						basePrice({
							currencies: { gbp: { amount: 39 }, eur: { amount: 45 } },
						}),
					],
				},
				customer: {
					prices: [
						asCustomRow(
							basePrice({
								currencies: { eur: { amount: 45 }, gbp: { amount: 39 } },
							}),
						),
					],
				},
				custom: false,
			},
			{
				name: "a shared currency's base amount moved → custom",
				catalog: {
					prices: [basePrice({ currencies: { gbp: { amount: 39 } } })],
				},
				customer: {
					prices: [basePrice({ currencies: { gbp: { amount: 35 } } })],
				},
				custom: true,
			},
			{
				name: "a shared currency's usage tiers moved → custom",
				catalog: {
					items: [
						payPerUseItem({
							currencies: { gbp: { usage_tiers: tiersIn(0.4) } },
						}),
					],
				},
				customer: {
					items: [
						payPerUseItem({
							currencies: { gbp: { usage_tiers: tiersIn(0.3) } },
						}),
					],
				},
				custom: true,
			},
			{
				name: "plan gains a currency on a usage price → not custom",
				catalog: {
					items: [
						payPerUseItem({
							currencies: { gbp: { usage_tiers: tiersIn(0.4) } },
						}),
					],
				},
				customer: { items: [payPerUseItem()] },
				custom: false,
			},
		]);
	});
});

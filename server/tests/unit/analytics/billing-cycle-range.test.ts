import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	CusProductStatus,
	type FullCustomer,
	PriceType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getBillingCycleStartDate } from "@/internal/analytics/analyticsUtils.js";

const SUBSCRIPTION_ANCHOR = Date.UTC(2026, 1, 4);
const SHORTEST_PERIOD_START = Date.UTC(2026, 7, 4);
const SHORTEST_PERIOD_END = Date.UTC(2026, 8, 4);

const mixedCadenceCustomer = () =>
	({
		customer_products: [
			{
				id: "cus_prod_enterprise",
				status: CusProductStatus.Active,
				created_at: SUBSCRIPTION_ANCHOR,
				billing_cycle_anchor: SUBSCRIPTION_ANCHOR,
				subscription_ids: ["sub_enterprise"],
				product: { id: "enterprise", is_add_on: false },
				customer_prices: [
					{
						price: {
							id: "price_yearly_base",
							config: {
								type: PriceType.Fixed,
								amount: 20_000,
								interval: BillingInterval.Year,
							},
						},
					},
					{
						price: {
							id: "price_monthly_usage",
							config: {
								type: PriceType.Usage,
								bill_when: BillWhen.EndOfPeriod,
								interval: BillingInterval.Month,
								internal_feature_id: "feature_credits",
								feature_id: "credits",
								usage_tiers: [{ to: -1, amount: 1 }],
							},
						},
					},
				],
				customer_entitlements: [],
			},
		],
		subscriptions: [
			{
				stripe_id: "sub_enterprise",
				created_at: SUBSCRIPTION_ANCHOR / 1000,
				current_period_start: SHORTEST_PERIOD_START / 1000,
				current_period_end: SHORTEST_PERIOD_END / 1000,
			},
		],
	}) as unknown as FullCustomer;

afterEach(() => setSystemTime());

describe("analytics billing-cycle ranges", () => {
	test("keeps the shortest Stripe item period on its exact boundaries", async () => {
		setSystemTime(new Date(Date.UTC(2026, 8, 1)));

		const result = await getBillingCycleStartDate({
			customer: mixedCadenceCustomer(),
			db: {} as AutumnContext["db"],
			ctx: {} as AutumnContext,
			intervalType: "1bc",
		});

		expect(result).toEqual({
			startDate: "2026-08-04 00:00:00",
			endDate: "2026-09-04 00:00:00",
			gap: 31,
		});
	});
});

/**
 * dfu.flash — RevenueCat one-off lifetime plan with a multi-line credits feature
 * (contract 4): cusProduct tagged revenuecat and each credits line (monthly +
 * one-off) receives its own filter-matched usage.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5, ResetInterval } from "@autumn/shared";
import {
	type FlashClient,
	callFlash,
} from "@tests/integration/billing/dfu/dfu-flash/utils/flashTestUtils.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: RevenueCat one-off with multi-line credits usage")}`,
	async () => {
		const customerId = "dfu-flash-rc-multiline";
		const lifetimePlan = products.base({
			id: "dfu-rc-lifetime",
			isAddOn: true,
			items: [
				items.monthlyCredits({ includedUsage: 15 }),
				constructFeatureItem({
					featureId: TestFeature.Credits,
					includedUsage: 100,
					interval: null,
				}),
			],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [lifetimePlan] }),
			],
			actions: [],
		});

		const payload = {
			customer_id: customerId,
			processors: [],
			billables: [
				{
					processor: "revenuecat",
					phases: [
						{
							starts_at: "now",
							plans: [
								{
									plan_id: lifetimePlan.id,
									status: "active",
									balances: [
										{
											feature_id: TestFeature.Credits,
											filter: {
												interval: "month",
												billing_behavior: "included",
											},
											usage: 5,
										},
										{
											feature_id: TestFeature.Credits,
											filter: { interval: null },
											usage: 10,
										},
									],
								},
							],
						},
					],
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);

		// ── Contract 4a: cusProduct present and tagged revenuecat. ──
		const flashed = flashRes.result?.flashed?.find(
			(f) => f.plan_id === lifetimePlan.id,
		);
		expect(flashed?.processor).toBe("revenuecat");

		// ── Contract 4b: each credits line gets its own usage (filter-matched). ──
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [lifetimePlan.id] });
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Credits,
			granted: 115,
			remaining: 100,
			usage: 15,
			breakdown: {
				[ResetInterval.Month]: { remaining: 10, usage: 5 },
				[ResetInterval.OneOff]: { remaining: 90, usage: 10 },
			},
		});
	},
);

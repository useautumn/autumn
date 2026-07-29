/**
 * billing.import — balance filter predicates (GalaxyAI lifetime-plan repro).
 *
 * Red (pre-fix):
 *  - `filter.interval` only accepted hour|day|week|month|year, so a one-off
 *    line could not be targeted except via an explicit `interval: null`;
 *    "lifetime" was rejected by the schema.
 *  - `filter.billing_behavior` only accepted included|prepaid; "usage_based"
 *    was rejected, so an included + pay-per-use pair was un-disambiguatable.
 *  - Ambiguity errors said "dfu.flash" instead of "billing.import".
 * Green: interval inherits EntInterval (lifetime = one-off line),
 * billing_behavior accepts usage_based, and errors say "billing.import".
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5, ResetInterval } from "@autumn/shared";
import {
	callFlash,
	type FlashClient,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

const lifetimeCreditsPlan = ({ id }: { id: string }) =>
	products.base({
		id,
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

test.concurrent(
	`${chalk.yellowBright("billing.import: interval 'lifetime' targets the one-off line")}`,
	async () => {
		const customerId = "dfu-flash-filter-lifetime";
		const plan = lifetimeCreditsPlan({ id: "dfu-filter-lifetime" });

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [],
		});

		const payload = {
			customer_id: customerId,
			billables: [
				{
					plan: {
						plan_id: plan.id,
						status: "active",
						started_at: Date.now() - 1000 * 60 * 60 * 24 * 120,
						balances: [
							{
								feature_id: TestFeature.Credits,
								filter: { interval: "month", billing_behavior: "included" },
								usage: 5,
							},
							{
								feature_id: TestFeature.Credits,
								filter: { interval: "lifetime", billing_behavior: "included" },
								usage: 10,
							},
						],
					},
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);
		expect(flashRes.errorMessage).toBeNull();

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [plan.id] });
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

test.concurrent(
	`${chalk.yellowBright("billing.import: billing_behavior 'usage_based' targets the pay-per-use line")}`,
	async () => {
		const customerId = "dfu-flash-filter-usage-based";
		const plan = products.base({
			id: "dfu-filter-usage-based",
			items: [
				items.monthlyMessages({ includedUsage: 10 }),
				items.consumableMessages({ includedUsage: 20, price: 0.1 }),
			],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [],
		});

		const payload = {
			customer_id: customerId,
			billables: [
				{
					plan: {
						plan_id: plan.id,
						status: "active",
						started_at: Date.now() - 1000 * 60 * 60 * 24 * 5,
						balances: [
							{
								feature_id: TestFeature.Messages,
								filter: { billing_behavior: "included" },
								usage: 4,
							},
							{
								feature_id: TestFeature.Messages,
								filter: { billing_behavior: "usage_based" },
								usage: 7,
							},
						],
					},
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);
		expect(flashRes.errorMessage).toBeNull();

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [plan.id] });
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: 30,
			remaining: 19,
			usage: 11,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("billing.import: ambiguous-filter error says billing.import, not dfu.flash")}`,
	async () => {
		const customerId = "dfu-flash-filter-ambiguous";
		const plan = lifetimeCreditsPlan({ id: "dfu-filter-ambiguous" });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [],
		});

		const payload = {
			customer_id: customerId,
			billables: [
				{
					plan: {
						plan_id: plan.id,
						status: "active",
						started_at: Date.now() - 1000 * 60 * 60 * 24 * 120,
						balances: [
							{
								feature_id: TestFeature.Credits,
								// Matches both the monthly and one-off included lines.
								filter: { billing_behavior: "included" },
								usage: 0,
							},
						],
					},
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);
		expect(flashRes.errorCode).toBe("flash_balance_ambiguous");
		expect(flashRes.errorMessage).toContain("billing.import");
		expect(flashRes.errorMessage).not.toContain("dfu.flash");
	},
);

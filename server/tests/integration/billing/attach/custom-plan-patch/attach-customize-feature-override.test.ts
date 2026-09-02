/**
 * Contract: feature_override on customize items survives the attach customize
 * paths (patch add_items and PUT items) and updateSubscription — the custom
 * entitlement row carries the override, and subsequent tracks deduct at the
 * override rate instead of the catalog rate.
 *
 * Catalog rate for Action1 in Credits is 0.2 credits/unit (v2Features.ts).
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const creditsItemV2 = ({
	included = 100,
	creditSchema,
}: {
	included?: number;
	creditSchema?: { metered_feature_id: string; credit_cost: number }[];
}) => ({
	feature_id: TestFeature.Credits,
	included,
	reset: { interval: ResetInterval.Month },
	...(creditSchema
		? { feature_override: { credit_schema: creditSchema } }
		: {}),
});

test.concurrent(
	`${chalk.yellowBright("attach customize feature-override: add_items override wins over catalog rate")}`,
	async () => {
		const customerId = "customize-override-add-items";
		const base = products.base({
			id: "base",
			items: [items.monthlyPrice({ price: 20 })],
		});

		const { autumnV2_3, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [base] }),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: base.id,
			customize: {
				add_items: [
					creditsItemV2({
						included: 100,
						creditSchema: [
							{ metered_feature_id: TestFeature.Action1, credit_cost: 0.5 },
						],
					}),
				],
			},
			enable_plan_immediately: true,
		});

		// 40 units * 0.5 (override) = 20 credits — not 40 * 0.2 = 8 (catalog).
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 40,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 80,
			usage: 20,
		});
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("attach customize feature-override: PUT items override wins over catalog rate")}`,
	async () => {
		const customerId = "customize-override-put-items";
		const base = products.base({
			id: "base",
			items: [
				items.monthlyPrice({ price: 20 }),
				items.free({ featureId: TestFeature.Credits, includedUsage: 50 }),
			],
		});

		const { autumnV2_3, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [base] }),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: base.id,
			customize: {
				items: [
					creditsItemV2({
						included: 100,
						creditSchema: [
							{ metered_feature_id: TestFeature.Action1, credit_cost: 0.5 },
						],
					}),
				],
			},
			enable_plan_immediately: true,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 40,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 80,
			usage: 20,
		});
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("update-subscription feature-override: customize items sets and clears the override")}`,
	async () => {
		const customerId = "update-sub-feature-override";
		const pro = products.base({
			id: "pro",
			items: [
				items.monthlyPrice({ price: 20 }),
				items.free({ featureId: TestFeature.Credits, includedUsage: 100 }),
			],
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// 1. Update the subscription to carry an override (5 credits/unit).
		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				price: null,
				items: [
					creditsItemV2({
						included: 100,
						creditSchema: [
							{ metered_feature_id: TestFeature.Action1, credit_cost: 5 },
						],
					}),
				],
			},
		});

		// 4 units * 5 = 20 credits — not 4 * 0.2 = 0.8 (catalog).
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 4,
		});
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Credits]).toMatchObject({
			balance: 80,
			usage: 20,
		});

		// 2. Update again without the override — back to the catalog rate.
		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				price: null,
				items: [creditsItemV2({ included: 100 })],
			},
		});

		// 10 units * 0.2 (catalog) = 2 credits.
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 10,
		});
		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerAfter.features[TestFeature.Credits].usage).toBe(2);
	},
	{ timeout: 120_000 },
);

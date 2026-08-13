import { test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

/** Same-plan resets update retained billing state without changing entitlement
 * lifecycle semantics or using stale patch inputs. */
test.concurrent(
	`${chalk.yellowBright("update-sub combined reset: same-plan customization resets cycle and usage")}`,
	async () => {
		const customerId = "update-sub-combined-custom";
		const pro = products.base({
			id: "pro",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 20 }),
			],
		});

		const { autumnV2_3, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 14 }),
			],
		});

		await autumnV2_3.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 40,
			},
			{ timeout: 2000 },
		);

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 30 }) },
			billing_cycle_anchor: "now",
			carry_over_usages: { enabled: false },
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			planId: pro.id,
			nextResetAt: addMonths(advancedTo, 1).getTime(),
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			remaining: 100,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update-sub usage reset: uses final patched item grant")}`,
	async () => {
		const customerId = "update-sub-reset-patched-grant";
		const pro = products.base({
			id: "pro",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 20 }),
			],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await autumnV2_3.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 40,
			},
			{ timeout: 2000 },
		);

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 300 },
			],
			customize: {
				remove_items: [{ feature_id: TestFeature.Messages }],
				add_items: [
					itemsV2.prepaidMessages({ amount: 10, billingUnits: 100 }),
				],
			},
			carry_over_usages: { enabled: false },
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			planId: pro.id,
			remaining: 300,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update-sub anchor reset: lifetime entitlement stays lifetime")}`,
	async () => {
		const customerId = "update-sub-anchor-lifetime";
		const pro = products.base({
			id: "pro",
			items: [
				items.lifetimeMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 20 }),
			],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 30 }) },
			billing_cycle_anchor: "now",
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			planId: pro.id,
			remaining: 100,
			usage: 0,
			nextResetAt: null,
		});
	},
);

import { test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

/** `billing_cycle_anchor` is rejected alongside `feature_quantities`, so
 * resizing a plan and restarting its cycle are necessarily two calls. This
 * covers the anchor-only call that follows the resize. */
test.concurrent(
	`${chalk.yellowBright("update-sub anchor now: restarting the cycle on the same plan grants a fresh balance")}`,
	async () => {
		const customerId = "update-sub-anchor-now-resets-usage";
		const pro = products.base({
			id: "pro",
			items: [
				items.prepaidMessages({ billingUnits: 1, price: 0.34 }),
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
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 1000 }],
				}),
				s.advanceTestClock({ days: 14 }),
			],
		});

		await autumnV2_3.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 400,
			},
			{ timeout: 2000 },
		);

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			billing_cycle_anchor: "now",
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
			remaining: 1000,
			usage: 0,
		});
	},
);

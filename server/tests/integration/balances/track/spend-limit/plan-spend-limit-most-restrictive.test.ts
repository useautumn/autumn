import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const overageItems = () => [
	items.lifetimeMessages({ includedUsage: 1000 }),
	items.consumableMessages({ includedUsage: 100, maxPurchase: 300, price: 0.5 }),
];

const spendLimit = (overageLimit: number) => ({
	spend_limits: [
		{ feature_id: TestFeature.Messages, enabled: true, overage_limit: overageLimit },
	],
});

test.concurrent(
	`${chalk.yellowBright("plan-spend-restrictive: with two attached plans, the lowest overage_limit wins (not the most recent)")}`,
	async () => {
		const basePlan = products.base({
			id: "plan-spend-restrictive-base",
			items: overageItems(),
			billingControls: spendLimit(10),
		});
		const addOnPlan = products.base({
			id: "plan-spend-restrictive-addon",
			isAddOn: true,
			items: overageItems(),
			billingControls: spendLimit(50),
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "plan-spend-restrictive-1",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [basePlan, addOnPlan] }),
			],
			actions: [
				s.billing.attach({
					productId: basePlan.id,
				}),
				s.billing.attach({
					productId: addOnPlan.id,
				}),
			],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2200,
		});
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_1.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});
	},
);

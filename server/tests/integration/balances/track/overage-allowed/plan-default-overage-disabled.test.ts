/**
 * A plan-default overage_allowed:false disables overage on a feature that allows
 * it natively (pay-per-use). The control's `false` branch overrides
 * usage_allowed at deduction-prep even for native-overage features, so the
 * balance caps at granted.
 */

import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("plan-default-overage-disabled: a PLAN-DEFAULT overage_allowed:false disables native overage")}`,
	async () => {
		const prod = products.base({
			id: "plan-default-overage-disabled",
			items: [
				items.consumableMessages({
					includedUsage: 100,
					maxPurchase: 300,
					price: 0.5,
				}),
			],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "plan-default-overage-disabled-1",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [prod] }),
			],
			actions: [
				s.billing.attach({
					productId: prod.id,
					billingControls: {
						overage_allowed: [
							{ feature_id: TestFeature.Messages, enabled: false },
						],
					},
				}),
			],
		});

		// Natively this feature would consume into its purchase allowance (250 ok).
		// The plan's false floors it at the granted 100.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 250,
		});

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: 100,
		});
	},
);
